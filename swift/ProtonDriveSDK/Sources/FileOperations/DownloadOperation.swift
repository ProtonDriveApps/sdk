import Foundation

public enum DownloadOperationResult: Sendable {
    case succeeded
    case pausedOnError(Error)
    case failed(Error)
}

public final class DownloadOperation: Sendable {
    
    private let fileDownloaderHandle: ObjectHandle
    private let downloadControllerHandle: ObjectHandle
    private let logger: Logger?
    private let progressCallbackWrapper: ProgressCallbackWrapper
    private let onOperationCancel: @Sendable () async throws -> Void
    private let onOperationDispose: @Sendable () async -> Void
    
    private var downloadControllerHandleForProtos: Int64 { Int64(downloadControllerHandle) }
    
    init(fileDownloaderHandle: ObjectHandle,
         downloadControllerHandle: ObjectHandle,
         progressCallbackWrapper: ProgressCallbackWrapper,
         logger: Logger?,
         onOperationCancel: @Sendable @escaping () async throws -> Void,
         onOperationDispose: @Sendable @escaping () async -> Void) {
        assert(fileDownloaderHandle != 0)
        assert(downloadControllerHandle != 0)
        self.fileDownloaderHandle = fileDownloaderHandle
        self.downloadControllerHandle = downloadControllerHandle
        self.progressCallbackWrapper = progressCallbackWrapper
        self.logger = logger
        self.onOperationCancel = onOperationCancel
        self.onOperationDispose = onOperationDispose
    }
    
    /// Wait for download completion
    public func awaitDownloadCompletion() async -> DownloadOperationResult {
        do {
            let awaitDownloadCompletionRequest = Proton_Drive_Sdk_DownloadControllerAwaitCompletionRequest.with {
                $0.downloadControllerHandle = downloadControllerHandleForProtos
            }
            
            try await SDKRequestHandler.send(awaitDownloadCompletionRequest, logger: logger) as Void
            return .succeeded
        } catch {
            if let isPaused = try? await isPaused(), isPaused {
                // if the operation is paused, we can try recovering from the error
                return .pausedOnError(error)
            } else {
                return .failed(error)
            }
        }
    }
    
    public func pause() async throws {
        let pauseRequest = Proton_Drive_Sdk_DownloadControllerPauseRequest.with {
            $0.downloadControllerHandle = downloadControllerHandleForProtos
        }
        try await SDKRequestHandler.send(pauseRequest, logger: logger) as Void
    }
    
    public func resume() async throws {
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
    
    // a convenience API allowing for cancelling the operation through DownloadOperation instance
    public func cancel() async throws {
        try await onOperationCancel()
    }
    
    deinit {
        Self.freeSDKObjects(downloadControllerHandle, fileDownloaderHandle, logger, onOperationDispose)
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
