import Foundation

/// Handles file download operations for ProtonDrive
public actor DownloadManager {

    private let clientHandle: ObjectHandle
    private let logger: Logger?
    private var activeDownloads: [UUID: CancellationTokenSource] = [:]

    init(clientHandle: ObjectHandle, logger: Logger?) {
        self.clientHandle = clientHandle
        self.logger = logger
    }

    deinit {
        activeDownloads.values.forEach {
            $0.free()
        }
    }

    /// Download file from file URL with complete download flow
    public func downloadFile(
        revisionUid: SDKRevisionUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeDownloads[cancellationToken] = cancellationTokenSource

        defer {
            if let cancellationTokenSource = activeDownloads[cancellationToken] {
                activeDownloads[cancellationToken] = nil
                cancellationTokenSource.free()
            }
        }

        let downloaderHandle = try await buildFileDownloader(
            revisionUid: revisionUid.sdkCompatibleIdentifier,
            fileURL: destinationUrl,
            cancellationHandle: cancellationTokenSource.handle
        )

        defer {
            freeDownloader(downloaderHandle)
        }

        let downloaderRequest = Proton_Drive_Sdk_DownloadToFileRequest.with {
            $0.downloaderHandle = Int64(downloaderHandle)
            $0.filePath = destinationUrl.path(percentEncoded: false)
            $0.progressAction = Int64(ObjectHandle(callback: cProgressCallback))
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let callbackState = ProgressCallbackWrapper(callback: progressCallback)
        let downloadControllerHandle: ObjectHandle = try await SDKRequestHandler.send(
            downloaderRequest,
            state: WeakReference(value: callbackState),
            includesLongLivedCallback: true,
            logger: logger
        )
        assert(downloadControllerHandle != 0)

        defer {
            freeDownloadController(downloadControllerHandle)
        }

        try await awaitDownloadCompletion(downloadControllerHandle)
    }

    func cancelDownload(with cancellationToken: UUID) async throws {
        guard let downloadCancellationToken = activeDownloads[cancellationToken] else {
            throw ProtonDriveSDKError(interopError: .noCancellationTokenForIdentifier(operation: "download"))
        }

        try await downloadCancellationToken.cancel()
        try await downloadCancellationToken.free()

        activeDownloads[cancellationToken] = nil
    }

    /// Get a file downloader for downloading files from Drive
    private func buildFileDownloader(
        revisionUid: String,
        fileURL: URL,
        cancellationHandle: ObjectHandle
    ) async throws -> ObjectHandle {
        let downloaderRequest = Proton_Drive_Sdk_DriveClientGetFileDownloaderRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.revisionUid = revisionUid
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let downloaderHandle: ObjectHandle = try await SDKRequestHandler.send(downloaderRequest, logger: logger)
        assert(downloaderHandle != 0)
        return downloaderHandle
    }

    /// Wait for download completion
    private func awaitDownloadCompletion(_ downloadControllerHandle: ObjectHandle) async throws {
        assert(downloadControllerHandle != 0)
        let awaitDownloadCompletionRequest = Proton_Drive_Sdk_DownloadControllerAwaitCompletionRequest.with {
            $0.downloadControllerHandle = Int64(downloadControllerHandle)
        }

        try await SDKRequestHandler.send(awaitDownloadCompletionRequest, logger: logger) as Void
    }

    /// Free a file downloader when no longer needed
    private func freeDownloader(_ fileDownloaderHandle: ObjectHandle) {
        Task {
            let freeRequest = Proton_Drive_Sdk_FileDownloaderFreeRequest.with {
                $0.fileDownloaderHandle = Int64(fileDownloaderHandle)
            }

            do {
                try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
            } catch {
                // If the request to free the downloader failed, we have a memory leak, but not much else can be done.
                // It's not gonna break the app's functionality, so we just log the issue and continue.
                logger?.error("Proton_Drive_Sdk_FileDownloaderFreeRequest failed: \(error)", category: "DownloadManager.freeDownloader")
            }
        }
    }

    /// Free a file download controller when no longer needed
    private func freeDownloadController(_ downloadControllerHandle: ObjectHandle) {
        Task {
            let freeRequest = Proton_Drive_Sdk_DownloadControllerFreeRequest.with {
                $0.downloadControllerHandle = Int64(downloadControllerHandle)
            }

            do {
                try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
            } catch {
                // If the request to free the download controller failed, we have a memory leak, but not much else can be done.
                // It's not gonna break the app's functionality, so we just log the issue and continue.
                logger?.error("Proton_Drive_Sdk_DownloadControllerFreeRequest failed: \(error)", category: "DownloadManager.freeDownloadController")
            }
        }
    }
}
