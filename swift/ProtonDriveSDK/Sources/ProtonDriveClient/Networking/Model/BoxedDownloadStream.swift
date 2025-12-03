import Foundation

final class BoxedDownloadStream {
    private let stream: URLSession.AsyncBytes
    private var iterator: URLSession.AsyncBytes.AsyncIterator
    
    private let logger: Logger
    
    init(stream: URLSession.AsyncBytes, logger: Logger) {
        self.stream = stream
        self.iterator = stream.makeAsyncIterator()
        self.logger = logger
    }
    
    func read(upTo bufferSize: Int) async throws -> (Data, Int) {
        let pointer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        var receivedBytes = 0
        while let byte = try await self.iterator.next() {
            pointer[receivedBytes] = byte
            receivedBytes += 1
            if receivedBytes == bufferSize {
                break
            }
        }
        
        let data = Data(bytesNoCopy: pointer, count: receivedBytes,
                        deallocator: .custom { _, _ in pointer.deallocate() })
        return (data, receivedBytes)
    }
    
    deinit {
        logger.trace("BoxedDownloadStream.deinit", category: "memory management")
    }
}
