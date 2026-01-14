import Foundation

public final class PhotoDownloadOperation: Sendable {

    private let photoDownloaderHandle: ObjectHandle
    private let downloadControllerHandle: ObjectHandle
    private let logger: Logger?
    private let progressCallbackWrapper: ProgressCallbackWrapper
    private let onOperationCancel: @Sendable () async throws -> Void
    private let onOperationDispose: @Sendable () async -> Void

    private var downloadControllerHandleForProtos: Int64 { Int64(downloadControllerHandle) }

    init(photoDownloaderHandle: ObjectHandle,
         downloadControllerHandle: ObjectHandle,
         progressCallbackWrapper: ProgressCallbackWrapper,
         logger: Logger?,
         onOperationCancel: @Sendable @escaping () async throws -> Void,
         onOperationDispose: @Sendable @escaping () async -> Void) {
        assert(photoDownloaderHandle != 0)
        assert(downloadControllerHandle != 0)
        self.photoDownloaderHandle = photoDownloaderHandle
        self.downloadControllerHandle = downloadControllerHandle
        self.progressCallbackWrapper = progressCallbackWrapper
        self.logger = logger
        self.onOperationCancel = onOperationCancel
        self.onOperationDispose = onOperationDispose
    }

    // Wait for download completion and uses operational resilience to retry if needed.
    /// Returns `nil` in case of successful completed download.
    /// Throws error in case the download has not completed.
    public func awaitDownloadWithResilience(
        operationalResilience: OperationalResilience,
        onRetriableErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> VerificationIssue? {
        try await awaitDownloadWithResilience(
            retryCounter: 0, operationalResilience: operationalResilience, onPauseErrorReceived: onRetriableErrorReceived
        )
    }

    private func awaitDownloadWithResilience(
        retryCounter: UInt,
        operationalResilience: OperationalResilience,
        onPauseErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> VerificationIssue? {
        let result = await awaitDownloadCompletion()
        switch result {
        case .succeeded:
            return nil

        case .completedWithVerificationError(let error):
            return error

        case .failed(let error):
            throw error

        case .pausedOnError(let error):
            throw error
        }
    }

    /// Wait for download completion, no retries
    public func awaitDownloadCompletion() async -> DownloadOperationResult {
        do {
            let awaitDownloadCompletionRequest = Proton_Drive_Sdk_DrivePhotosClientAwaitDownloadCompletionRequest.with {
                $0.downloadControllerHandle = downloadControllerHandleForProtos
            }

            try await SDKRequestHandler.send(awaitDownloadCompletionRequest, logger: logger) as Void
            return .succeeded
        } catch {
            return .failed(error)
        }
    }

    // a convenience API allowing for cancelling the operation through DownloadOperation instance
    public func cancel() async throws {
        try await onOperationCancel()
    }

    deinit {
        Self.freeSDKObjects(downloadControllerHandle, photoDownloaderHandle, logger, onOperationDispose)
    }

    private static func freeSDKObjects(
        _ downloadControllerHandle: ObjectHandle,
        _ fileDownloaderHandle: ObjectHandle,
        _ logger: Logger?,
        _ onOperationDispose: @Sendable @escaping () async -> Void
    ) {
        Task {
            await onOperationDispose()
            await freeDownloadController(Int64(downloadControllerHandle), logger)
            await freeFileDownloader(Int64(fileDownloaderHandle), logger)
        }
    }

    /// Free a file downloader when no longer needed
    private static func freeFileDownloader(_ fileDownloaderHandle: Int64, _ logger: Logger?) async {
        let freeRequest = Proton_Drive_Sdk_DrivePhotosClientDownloaderFreeRequest.with {
            $0.fileDownloaderHandle = fileDownloaderHandle
        }

        do {
            try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
        } catch {
            // If the request to free the downloader failed, we have a memory leak, but not much else can be done.
            // It's not gonna break the app's functionality, so we just log the issue and continue.
            logger?.error("Proton_Drive_Sdk_DrivePhotosClientDownloaderFreeRequest failed: \(error)", category: "DownloadManager.freeDownloader")
        }
    }

    /// Free a file download controller when no longer needed
    private static func freeDownloadController(_ downloadControllerHandle: Int64, _ logger: Logger?) async {
        let freeRequest = Proton_Drive_Sdk_DownloadControllerFreeRequest.with {
            $0.downloadControllerHandle = downloadControllerHandle
        }
        do {
            try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
        } catch {
            // If the request to free the download controller failed, we have a memory leak, but not much else can be done.
            // It's not gonna break the app's functionality, so we just log the issue and continue.
            logger?.error("Proton_Drive_Sdk_DownloadControllerFreeRequest failed: \(error)", category: "DownloadController.freeDownloadController")
        }
    }
}
