import Foundation

public final class StreamForUpload: NSObject, StreamDelegate, @unchecked Sendable {

    public let input: InputStream
    let output: OutputStream
    
    public var onStreamError: (Error) -> Void = { _ in }

    let sdkContentHandle: Int64
    let logger: Logger
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
    
    private var remainingBytes: [UInt8] = []
    private let writingQueue = DispatchQueue(label: "StreamForUpload.WritingQueue", qos: .userInitiated)

    init(inputStream: InputStream, outputStream: OutputStream, bufferLength: Int, sdkContentHandle: Int64, logger: Logger) throws {
        self.bufferLength = bufferLength
        self.sdkContentHandle = sdkContentHandle
        self.logger = logger
        self.input = inputStream
        self.output = outputStream
        self.buffer = UnsafeMutableRawBufferPointer.allocate(byteCount: bufferLength, alignment: MemoryLayout<UInt8>.alignment)
        super.init()
    }
    
    public func openOutputStream() {
        output.delegate = self
        output.schedule(in: RunLoop.main, forMode: .default)
        output.open()
    }

    public func stream(_ aStream: Stream, handle eventCode: Stream.Event) {
        guard aStream == output.outputStream else { return }

        if eventCode.contains(.hasSpaceAvailable) {
            receivedHasSpaceAvailableEvent()
        }

        if eventCode.contains(.errorOccurred) {
            invokeStreamError(aStream.streamError, fallbackMessage: "Stream error")
        }
    }

    private func makeError(_ error: Error?, fallbackMessage: String) -> Error {
        return error ?? ProtonDriveSDKError(interopError: .wrongResult(message: fallbackMessage))
    }

    private func invokeStreamError(_ error: Error?, fallbackMessage: String) {
        let error = makeError(error, fallbackMessage: fallbackMessage)
        invokeStreamError(error)
    }

    private func invokeStreamError(_ error: Error) {
        onStreamError(error)
        closeAndCleanUp()
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
            guard self.remainingBytes.isEmpty else {
                processRemainingBytes()
                return
            }

            let baseAddress = buffer.baseAddress!
            let streamReadRequest = Proton_Sdk_StreamReadRequest.with {
                $0.bufferLength = Int32(buffer.count)
                $0.bufferPointer = Int64(ObjectHandle(rawPointer: UnsafeRawPointer(baseAddress)))
                $0.streamHandle = sdkContentHandle
            }
            SDKRequestHandler.send(streamReadRequest, logger: logger) { (result: Result<Int32, Error>) in
                self.handleReadResult(result, baseAddress: baseAddress)
            }
        }
    }

    private func processRemainingBytes() {
        do {
            try remainingBytes.withUnsafeBufferPointer { buffer in
                let bytesWritten = output.write(buffer.baseAddress!, maxLength: remainingBytes.count)
                if bytesWritten < 0 {
                    throw makeError(output.streamError, fallbackMessage: "Failed to append stream data")
                } else if bytesWritten < remainingBytes.count {
                    // We have bytes in the memory from the last time
                    // we were writing to the stream. We use them instead of asking the SDK.
                    // Once all the remaining bytes are written, ask the SDK for more
                    remainingBytes = Array(remainingBytes[bytesWritten...])
                } else {
                    remainingBytes = []
                }
            }
            hasFinishedWriting()
        } catch {
            invokeStreamError(error)
        }
    }

    private func handleReadResult(_ result: Result<Int32, Error>, baseAddress: UnsafeMutableRawPointer) {
        do {
            switch result {
            case .success(let read):
                if read == 0 {
                    output.close()
                } else {
                    let bytesWritten = output.write(baseAddress, maxLength: Int(read))
                    if bytesWritten < 0 {
                        throw makeError(output.streamError, fallbackMessage: "Failed to write stream data")
                    } else if bytesWritten < Int(read) {
                        // Keep the remaining, unwritten bytes in the memory.
                        // On the next .hasSpaceAvailable event, we will write
                        // these bytes from the memory instead of asking the SDK.
                        remainingBytes = Array(self.buffer[bytesWritten...])
                    }
                }
            case .failure(let error):
                throw error
            }
            hasFinishedWriting()
        } catch {
            invokeStreamError(error)
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

extension OutputStream {
    @objc open var outputStream: OutputStream { self }
}
