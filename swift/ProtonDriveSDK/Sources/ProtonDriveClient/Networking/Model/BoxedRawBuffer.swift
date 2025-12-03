import Foundation

final class BoxedRawBuffer {
    private let buffer: UnsafeMutableRawBufferPointer
    private let address: UnsafeMutableRawPointer
    private let count: Int
    private var offset: Int = 0
    
    private let logger: Logger
    
    // Store these for deinit since deinit is nonisolated
    nonisolated private let deinitAddress: Int
    nonisolated private let deinitCount: Int

    init(bufferSize: Int, logger: Logger) {
        let rawBuffer = UnsafeMutableRawBufferPointer.allocate(byteCount: bufferSize,
                                                               alignment: MemoryLayout<UInt8>.alignment)
        let bufferAddress = rawBuffer.baseAddress!
        let bufferCount = rawBuffer.count
        self.buffer = rawBuffer
        self.address = bufferAddress
        self.count = bufferCount
        self.deinitAddress = Int(bitPattern: bufferAddress)
        self.deinitCount = bufferCount
        self.logger = logger
    }
    
    func copyBytes(from data: Data) {
        data.copyBytes(to: buffer)
    }
    
    func copyBytes(to buffer: UnsafeMutablePointer<UInt8>, count bufferSize: Int) -> Int {
        let copiedBytesCount: Int
        let remainingData = count - offset
        if remainingData >= bufferSize {
            copiedBytesCount = bufferSize
            performCopying(to: buffer, count: copiedBytesCount)
        } else if remainingData > 0 {
            copiedBytesCount = remainingData
            performCopying(to: buffer, count: copiedBytesCount)
        } else {
            // we are done, nothing more to send to SDK
            copiedBytesCount = 0
        }
        return copiedBytesCount
    }
    
    private func performCopying(to destination: UnsafeMutablePointer<UInt8>, count: Int) {
        let currentAddress = address.advanced(by: offset)
        let source = currentAddress.assumingMemoryBound(to: UInt8.self)
        destination.update(from: source, count: count)
        self.offset += count
    }

    deinit {
        logger.trace("BoxedRawBuffer.deinit", category: "memory management")
        let pointer = UnsafeMutableRawPointer(bitPattern: deinitAddress)!
        UnsafeMutableRawBufferPointer(start: pointer, count: deinitCount).deallocate()
    }
}
