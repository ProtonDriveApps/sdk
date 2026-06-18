import Foundation

final class BoxedDownloadStream {
    enum Source {
        case stream(AsyncBytesDownloadStream)
        case file(FileHandleDownloadStream)
    }
    private let source: Source
    private let logger: Logger

    init(source: Source, logger: Logger) {
        self.source = source
        self.logger = logger
    }

    func read(upTo bufferSize: Int) async throws -> (Data, Int) {
        switch source {
        case let .stream(asyncBytes):
            return try await asyncBytes.read(upTo: bufferSize)
        case let .file(fileHandle):
            return try await fileHandle.read(upTo: bufferSize)
        }
    }

    deinit {
        logger.trace("BoxedDownloadStream.deinit", category: "memory management")
    }
}

final class AsyncBytesDownloadStream {
    private let stream: AnyAsyncSequence<UInt8>
    private var iterator: AnyAsyncIterator<UInt8>
    
    init(stream: AnyAsyncSequence<UInt8>) {
        self.stream = stream
        self.iterator = stream.makeAsyncIterator()
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
}

final class FileHandleDownloadStream {
    private let fileHandle: FileHandle

    init(fileHandle: FileHandle) {
        self.fileHandle = fileHandle
    }

    func read(upTo bufferSize: Int) async throws -> (Data, Int) {
        let data = try fileHandle.read(upToCount: bufferSize) ?? Data()
        return (data, data.count)
    }

    deinit {
        try? fileHandle.close()
    }
}
