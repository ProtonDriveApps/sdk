import Foundation

public typealias VerificationIssue = ProtonDriveSDKDataIntegrityError

public enum DownloadOperationResult: Sendable {
    case succeeded
    case completedWithVerificationError(VerificationIssue)
    case pausedOnError(Error)
    case failed(Error)
}

public final class DownloadOperation: Sendable {
    private enum DownloadCallback: Sendable {
        case progress(ProgressCallbackWrapper)
        case stream(StreamDownloadState)
    }

    private let fileDownloaderHandle: ObjectHandle
    private let downloadControllerHandle: ObjectHandle
    private let logger: Logger?
    private let nodeType: NodeType
    private let downloadCallback: DownloadCallback
    private let onOperationCancel: @Sendable () async throws -> Void
    private let onOperationDispose: @Sendable () async -> Void
    private let pauseState = PauseState()

    private var downloadControllerHandleForProtos: Int64 { Int64(downloadControllerHandle) }

    init(fileDownloaderHandle: ObjectHandle,
         downloadControllerHandle: ObjectHandle,
         progressCallbackWrapper: ProgressCallbackWrapper,
         logger: Logger?,
         nodeType: NodeType,
         onOperationCancel: @Sendable @escaping () async throws -> Void,
         onOperationDispose: @Sendable @escaping () async -> Void) {
        assert(fileDownloaderHandle != 0)
        assert(downloadControllerHandle != 0)
        self.fileDownloaderHandle = fileDownloaderHandle
        self.downloadControllerHandle = downloadControllerHandle
        self.downloadCallback = .progress(progressCallbackWrapper)
        self.logger = logger
        self.nodeType = nodeType
        self.onOperationCancel = onOperationCancel
        self.onOperationDispose = onOperationDispose
    }

    init(fileDownloaderHandle: ObjectHandle,
         downloadControllerHandle: ObjectHandle,
         streamDownloadState: StreamDownloadState,
         logger: Logger?,
         nodeType: NodeType,
         onOperationCancel: @Sendable @escaping () async throws -> Void,
         onOperationDispose: @Sendable @escaping () async -> Void) {
        assert(fileDownloaderHandle != 0)
        assert(downloadControllerHandle != 0)
        self.fileDownloaderHandle = fileDownloaderHandle
        self.downloadControllerHandle = downloadControllerHandle
        self.downloadCallback = .stream(streamDownloadState)
        self.logger = logger
        self.nodeType = nodeType
        self.onOperationCancel = onOperationCancel
        self.onOperationDispose = onOperationDispose
    }
    
    // Wait for download completion and uses operational resilience to retry if needed.
    /// Returns `nil` in case of successful completed download.
    /// Returns `VerificationIssue` object if the download completed, but could not be verified.
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
            onPauseErrorReceived(error)
            return try await operationalResilience.performRetry(retryCounter, error) {
                try await resume()
                return try await awaitDownloadWithResilience(
                    retryCounter: $0,
                    operationalResilience: operationalResilience,
                    onPauseErrorReceived: onPauseErrorReceived
                )
            }
        }
    }
    
    /// Wait for download completion, no retries
    public func awaitDownloadCompletion() async -> DownloadOperationResult {
        do {
            let awaitDownloadCompletionRequest = Proton_Drive_Sdk_DownloadControllerAwaitCompletionRequest.with {
                $0.downloadControllerHandle = downloadControllerHandleForProtos
            }

            try await SDKRequestHandler.send(awaitDownloadCompletionRequest, logger: logger) as Void
            return .succeeded
        } catch {
            return await processDownloadError(error)
        }
    }
    
    private func processDownloadError(_ error: Error) async -> DownloadOperationResult {
        // handle the special case of the successful download of file that has not passed verification check
        if let sdkError = error as? ProtonDriveSDKError,
           let dataIntegrityError = sdkError.underlyingDataIntegrityError,
           let isDownloadCompleteWithVerificationIssue = try? await isDownloadCompleteWithVerificationIssue() {
            if isDownloadCompleteWithVerificationIssue {
                logger?.info("DownloadCompleteWithVerificationIssue: \(dataIntegrityError.localizedDescription)",
                             category: "DownloadOperation")
                return .completedWithVerificationError(dataIntegrityError)
            }
        }

        if let sdkError = error as? ProtonDriveSDKError,
           sdkError.domain == .successfulCancellation,
           await pauseState.isRequested() {
            return .pausedOnError(error)
        }

        // check if operation can be resumed as the recovery flow
        do {
            guard try await isPaused() else {
                // If the operation is not paused, we consider the operation failed. If we want to retry later, we will need a new operation.
                return .failed(error)
            }
            // If the operation is paused, we can try recovering from the error by resuming the operation
            return .pausedOnError(error)

        } catch let isPausedError {
            logger?.info("Checking isPaused status failed with: \(isPausedError.localizedDescription)",
                         category: "DownloadOperation")
            return .failed(error)
        }
    }
    
    public func pause() async throws {
        await pauseState.setRequested(true)
        let pauseRequest = Proton_Drive_Sdk_DownloadControllerPauseRequest.with {
            $0.downloadControllerHandle = downloadControllerHandleForProtos
        }
        try await SDKRequestHandler.send(pauseRequest, logger: logger) as Void
    }
    
    public func resume() async throws {
        await pauseState.setRequested(false)
        let resumeRequest = Proton_Drive_Sdk_DownloadControllerResumeRequest.with {
            $0.downloadControllerHandle = downloadControllerHandleForProtos
        }
        try await SDKRequestHandler.send(resumeRequest, logger: logger) as Void
    }
    
    public func isPaused() async throws -> Bool {
        let isPausedRequest = Proton_Drive_Sdk_DownloadControllerIsPausedRequest.with {
            $0.downloadControllerHandle = downloadControllerHandleForProtos
        }
        return try await SDKRequestHandler.send(isPausedRequest, logger: logger)
    }
    
    public func isDownloadCompleteWithVerificationIssue() async throws -> Bool {
        let isDownloadCompleteWithVerificationIssueRequest = Proton_Drive_Sdk_DownloadControllerIsDownloadCompleteWithVerificationIssueRequest.with {
            $0.downloadControllerHandle = downloadControllerHandleForProtos
        }
        return try await SDKRequestHandler.send(isDownloadCompleteWithVerificationIssueRequest, logger: logger)
    }
    
    // a convenience API allowing for cancelling the operation through DownloadOperation instance
    public func cancel() async throws {
        try await onOperationCancel()
    }
    
    deinit {
        Self.freeSDKObjects(downloadControllerHandle, fileDownloaderHandle, logger, nodeType, onOperationDispose)
    }
    
    private static func freeSDKObjects(
        _ downloadControllerHandle: ObjectHandle,
        _ fileDownloaderHandle: ObjectHandle,
        _ logger: Logger?,
        _ nodeType: NodeType,
        _ onOperationDispose: @Sendable @escaping () async -> Void
    ) {
        Task {
            await onOperationDispose()
            await freeDownloadController(Int64(downloadControllerHandle), logger)
            switch nodeType {
            case .file:
                await freeFileDownloader(Int64(fileDownloaderHandle), logger)
            case .photo:
                await freePhotoDownloader(Int64(fileDownloaderHandle), logger)
            }
        }
    }
    
    /// Free a file downloader when no longer needed
    private static func freeFileDownloader(_ fileDownloaderHandle: Int64, _ logger: Logger?) async {
        let freeRequest = Proton_Drive_Sdk_FileDownloaderFreeRequest.with {
            $0.fileDownloaderHandle = fileDownloaderHandle
        }

        do {
            try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
        } catch {
            // If the request to free the downloader failed, we have a memory leak, but not much else can be done.
            // It's not gonna break the app's functionality, so we just log the issue and continue.
            logger?.error("Proton_Drive_Sdk_FileDownloaderFreeRequest failed: \(error)", category: "DownloadManager.freeDownloader")
        }
    }

    /// Free a photo downloader when no longer needed
    private static func freePhotoDownloader(_ photoDownloaderHandle: Int64, _ logger: Logger?) async {
        let freeRequest = Proton_Drive_Sdk_DrivePhotosClientDownloaderFreeRequest.with {
            $0.fileDownloaderHandle = photoDownloaderHandle
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

private actor PauseState {
    private var requested = false

    func setRequested(_ requested: Bool) {
        self.requested = requested
    }

    func isRequested() -> Bool {
        requested
    }
}
