import Foundation

final class BoxedStreamingData {
    enum StreamingData {
        case upload(BoxedRawBuffer)
        case download(BoxedDownloadStream)
    }

    let data: StreamingData
    private let logger: Logger

    init(uploadBuffer: BoxedRawBuffer, logger: Logger) {
        data = .upload(uploadBuffer)
        self.logger = logger
    }

    init(downloadFileHandle fileHandle: FileHandle, logger: Logger) {
        let source = BoxedDownloadStream.Source.file(FileHandleDownloadStream(fileHandle: fileHandle))
        let downloadStream = BoxedDownloadStream(source: source, logger: logger)
        data = .download(downloadStream)
        self.logger = logger
    }

    init(downloadStream stream: AnyAsyncSequence<UInt8>, logger: Logger) {
        let source = BoxedDownloadStream.Source.stream(AsyncBytesDownloadStream(stream: stream))
        let downloadStream = BoxedDownloadStream(source: source, logger: logger)
        data = .download(downloadStream)
        self.logger = logger
    }

    deinit {
        logger.trace("BoxedStreamingData.deinit", category: "memory management")
    }
}
