import Foundation

actor BoxedDownloadStream: Sendable {
    private let stream: URLSession.AsyncBytes
    private var iterator: URLSession.AsyncBytes.AsyncIterator
    
    private let logger: Logger
    
    init(stream: URLSession.AsyncBytes, logger: Logger) {
        self.stream = stream
        self.iterator = stream.makeAsyncIterator()
        self.logger = logger
    }
    
    func next() async throws -> UInt8? {
        var localIterator = self.iterator
        defer { self.iterator = localIterator }
        return try await localIterator.next()
    }
    
    deinit {
        logger.trace("BoxedDownloadStream.deinit", category: "memory management")
    }
}
