import Foundation

/// Handles photo download operations for ProtonDrive
actor PhotoDownloadsManager {

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

    func downloadPhotoOperation(
        photoUid: SDKNodeUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> PhotoDownloadOperation {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeDownloads[cancellationToken] = cancellationTokenSource

        let downloaderHandle = try await buildDownloader(
            photoUid: photoUid.sdkCompatibleIdentifier,
            fileURL: destinationUrl,
            cancellationHandle: cancellationTokenSource.handle
        )

        let downloaderRequest = Proton_Drive_Sdk_DrivePhotosClientDownloadToFileRequest.with {
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

        return PhotoDownloadOperation(
            photoDownloaderHandle: downloaderHandle,
            downloadControllerHandle: downloadControllerHandle,
            progressCallbackWrapper: callbackState,
            logger: logger,
            onOperationCancel: { [weak self] in
                guard let self else { return }
                try await self.cancelDownload(with: cancellationToken)
            },
            onOperationDispose: { [weak self] in
                guard let self else { return }
                await self.freeCancellationTokenSourceIfNeeded(cancellationToken: cancellationToken)
            }
        )
    }

    // API to cancel operation when the client does not use the DownloadOperation
    func cancelDownload(with cancellationToken: UUID) async throws {
        guard let downloadCancellationToken = activeDownloads[cancellationToken] else {
            throw ProtonDriveSDKError(interopError: .noCancellationTokenForIdentifier(operation: "download"))
        }

        try await downloadCancellationToken.cancel()

        activeDownloads[cancellationToken] = nil
        downloadCancellationToken.free()
    }

    private func freeCancellationTokenSourceIfNeeded(cancellationToken: UUID) {
        guard let cancellationTokenSource = activeDownloads[cancellationToken] else { return }
        activeDownloads[cancellationToken] = nil
        cancellationTokenSource.free()
    }

    /// Get a photo downloader for downloading files from Drive
    private func buildDownloader(
        photoUid: String,
        fileURL: URL,
        cancellationHandle: ObjectHandle
    ) async throws -> ObjectHandle {
        let downloaderRequest = Proton_Drive_Sdk_DrivePhotosClientGetPhotoDownloaderRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.photoUid = photoUid
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let downloaderHandle: ObjectHandle = try await SDKRequestHandler.send(downloaderRequest, logger: logger)
        assert(downloaderHandle != 0)
        return downloaderHandle
    }
}
