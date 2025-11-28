import Foundation

public final class StreamForUpload: NSObject, StreamDelegate, @unchecked Sendable {

    public let input: InputStream
    public let output: OutputStream

    let sdkContentHandle: Int64
    let logger: Logger
    public var onStreamError: (Error) -> Void = { _ in }
    let buffer: UnsafeMutableRawBufferPointer
    let bufferLength: Int
    
    enum State {
        case initialized
        case isReadyForNextWrite
        case writingInProgress
        case writingDone
        case isClosed
    }
    
    private var state: State = .initialized
    private let stateQueue = DispatchQueue(label: "StreamForUpload.StateQueue", qos: .userInitiated)
    public var hasStartedWriting: Bool {
        stateQueue.sync { state != .initialized }
    }
    
    private var remainingBytes: [UInt8] = []
    private let writingQueue = DispatchQueue(label: "StreamForUpload.WritingQueue", qos: .userInitiated)

    init(bufferLength: Int, sdkContentHandle: Int64, logger: Logger) throws {
        var inputOrNil: InputStream? = nil
        var outputOrNil: OutputStream? = nil
        Stream.getBoundStreams(withBufferSize: bufferLength,
                               inputStream: &inputOrNil,
                               outputStream: &outputOrNil)
        guard let input = inputOrNil, let output = outputOrNil else {
            throw ProtonDriveSDKError(interopError: .wrongResult(message: "Cannot make stream"))
        }
        self.bufferLength = bufferLength
        self.sdkContentHandle = sdkContentHandle
        self.logger = logger
        self.input = input
        self.output = output
        self.buffer = UnsafeMutableRawBufferPointer.allocate(byteCount: bufferLength, alignment: MemoryLayout<UInt8>.alignment)
        super.init()
    }
    
    public func openOutputStream() {
        output.delegate = self
        output.schedule(in: RunLoop.main, forMode: .default)
        output.open()
    }

    public func stream(_ aStream: Stream, handle eventCode: Stream.Event) {
        guard aStream == output else { return }

        if eventCode.contains(.hasSpaceAvailable) {
            receivedHasSpaceAvailableEvent()
        }

        if eventCode.contains(.errorOccurred) {
            onStreamError(aStream.streamError ?? ProtonDriveSDKError(interopError: .wrongResult(message: "Stream error")))
            closeAndCleanUp()
        }
    }
    
    private func receivedHasSpaceAvailableEvent() {
        stateQueue.sync {
            switch state {
            case .initialized, .writingDone:
                state = .isReadyForNextWrite
            case .isReadyForNextWrite:
                break /* no-op, we already know */
            case .writingInProgress, .isClosed:
                break /* ignore, we're not ready to send any more data */
            }
            
            if state == .isReadyForNextWrite {
                state = .writingInProgress
                writeToOutputStream()
            }
        }
    }
    
    private func hasFinishedWriting() {
        stateQueue.sync {
            switch state {
            case .writingInProgress:
                state = .writingDone
            case .isClosed:
                return /* no-op, our stream is not usable for writing anymore */
            case .initialized, .isReadyForNextWrite, .writingDone:
                assertionFailure("We should never be in \(state) state when we finish writing")
            }
        }
    }

    private func writeToOutputStream() {
        writingQueue.async { [weak self] in
            guard let self else { return }
            do {
                guard self.remainingBytes.isEmpty else {
                    self.remainingBytes.withUnsafeBufferPointer { buffer in
                        let bytesWritten = self.output.write(buffer.baseAddress!, maxLength: remainingBytes.count)
                        if bytesWritten < remainingBytes.count {
                            // We have bytes in the memory from the last time
                            // we were writing to the stream. We use them instead of asking the SDK.
                            // Once all the remaining bytes are written, ask the SDK for more
                            self.remainingBytes = Array(remainingBytes[bytesWritten...])
                        } else {
                            self.remainingBytes = []
                        }
                    }
                    hasFinishedWriting()
                    return
                }
                
                let baseAddress = buffer.baseAddress!
                let streamReadRequest = Proton_Sdk_StreamReadRequest.with {
                    $0.bufferLength = Int32(buffer.count)
                    $0.bufferPointer = Int64(ObjectHandle(rawPointer: UnsafeRawPointer(baseAddress)))
                    $0.streamHandle = sdkContentHandle
                }
                SDKRequestHandler.send(streamReadRequest, logger: logger) { (result: Result<Int32, Error>) in
                    switch result {
                    case .success(let read):
                        if read == 0 {
                            self.output.close()
                        } else {
                            let bytesWritten = self.output.write(baseAddress, maxLength: Int(read))
                            if bytesWritten < Int(read) {
                                // Keep the remaining, unwritten bytes in the memory.
                                // On the next .hasSpaceAvailable event, we will write
                                // these bytes from the memory instead of asking the SDK.
                                self.remainingBytes = Array(self.buffer[bytesWritten...])
                            }
                        }
                    case .failure(let error):
                        self.onStreamError(error)
                    }
                    self.hasFinishedWriting()
                }
            } catch {
                onStreamError(error)
                hasFinishedWriting()
            }
        }
    }

    private func closeAndCleanUp() {
        let shouldClose = stateQueue.sync {
            let isAlreadyClosed = self.state == .isClosed
            self.state = .isClosed
            return !isAlreadyClosed
        }
        guard shouldClose else { return }
        output.close()
        input.close()
    }

    deinit {
        closeAndCleanUp()
        buffer.deallocate()
    }
}
