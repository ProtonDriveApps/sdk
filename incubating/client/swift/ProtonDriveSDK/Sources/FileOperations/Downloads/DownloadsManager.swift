import Foundation

/// Handles file download operations for ProtonDrive
actor DownloadsManager {

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
    
    func downloadFileOperation(
        revisionUid: SDKRevisionUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> DownloadOperation {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeDownloads[cancellationToken] = cancellationTokenSource

        let downloaderHandle = try await buildFileDownloader(
            revisionUid: revisionUid.sdkCompatibleIdentifier,
            fileURL: destinationUrl,
            cancellationHandle: cancellationTokenSource.handle
        )

        let downloaderRequest = Proton_Drive_Sdk_DownloadToFileRequest.with {
            $0.downloaderHandle = Int64(downloaderHandle)
            $0.filePath = destinationUrl.path(percentEncoded: false)
            $0.progressAction = Int64(ObjectHandle(callback: cProgressCallbackForDownload))
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let callbackState = ProgressCallbackWrapper(callback: progressCallback)
        let downloadControllerHandle: ObjectHandle = try await SDKRequestHandler.send(
            downloaderRequest,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )

        let operation = DownloadOperation(
            fileDownloaderHandle: downloaderHandle,
            downloadControllerHandle: downloadControllerHandle,
            progressCallbackWrapper: callbackState,
            logger: logger,
            nodeType: .file,
            onOperationCancel: { [weak self] in
                guard let self else { return }
                try await self.cancelDownload(with: cancellationToken)
            },
            onOperationDispose: { [weak self] in
                guard let self else { return }
                await self.freeCancellationTokenSourceIfNeeded(cancellationToken: cancellationToken)
            }
        )

        return operation
    }

    func downloadToStreamOperation(
        revisionUid: SDKRevisionUid,
        outputStream: SeekableOutputStream,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> DownloadOperation {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeDownloads[cancellationToken] = cancellationTokenSource

        let downloaderHandle = try await buildFileDownloaderForStream(
            revisionUid: revisionUid.sdkCompatibleIdentifier,
            cancellationHandle: cancellationTokenSource.handle
        )

        let downloaderRequest = Proton_Drive_Sdk_DownloadToStreamRequest.with {
            $0.downloaderHandle = Int64(downloaderHandle)
            $0.writeAction = Int64(ObjectHandle(callback: cStreamWriteCallback))
            $0.progressAction = Int64(ObjectHandle(callback: cStreamProgressCallback))
            $0.seekAction = Int64(ObjectHandle(callback: cStreamSeekCallback))
            $0.cancelAction = Int64(ObjectHandle(callback: cStreamCancelCallback))
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let callbackState = StreamDownloadState(
            outputStream: outputStream,
            progressCallback: progressCallback
        )
        let downloadControllerHandle: ObjectHandle = try await SDKRequestHandler.send(
            downloaderRequest,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )

        let operation = DownloadOperation(
            fileDownloaderHandle: downloaderHandle,
            downloadControllerHandle: downloadControllerHandle,
            streamDownloadState: callbackState,
            logger: logger,
            nodeType: .file,
            onOperationCancel: { [weak self] in
                guard let self else { return }
                try await self.cancelDownload(with: cancellationToken)
            },
            onOperationDispose: { [weak self] in
                guard let self else { return }
                await self.freeCancellationTokenSourceIfNeeded(cancellationToken: cancellationToken)
            }
        )
        
        callbackState.markReady()
        return operation
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

    /// Get a file downloader for stream-based downloads from Drive
    private func buildFileDownloaderForStream(
        revisionUid: String,
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
}
