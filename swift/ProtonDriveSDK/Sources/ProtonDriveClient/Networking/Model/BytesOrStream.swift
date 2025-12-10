import Foundation

final class BoxedStreamingData {
    let uploadBuffer: BoxedRawBuffer?
    let downloadStream: BoxedDownloadStream?
    
    private let logger: Logger

    init(uploadBuffer: BoxedRawBuffer, logger: Logger) {
        self.uploadBuffer = uploadBuffer
        self.downloadStream = nil
        self.logger = logger
    }

    init(downloadStream stream: AnyAsyncSequence<UInt8>, logger: Logger) {
        self.uploadBuffer = nil
        self.downloadStream = BoxedDownloadStream(stream: stream, logger: logger)
        self.logger = logger
    }

    deinit {
        logger.trace("BoxedStreamingData.deinit", category: "memory management")
    }
}
