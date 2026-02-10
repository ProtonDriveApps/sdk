import Foundation
import SwiftProtobuf

/// Main entry point for all SDK functionality.
///
/// Create a single object of this class and use it to perform downloads, uploads and all other supported operations.
public actor ProtonDriveClient: Sendable, ProtonSDKClient {

    private var clientHandle: ObjectHandle = 0

    private var uploadsManager: UploadsManager!
    private var downloadsManager: DownloadsManager!
    private var thumbnailsManager: DownloadThumbnailsManager!

    let logger: ProtonDriveSDK.Logger
    let recordMetricEventCallback: RecordMetricEventCallback
    let featureFlagProviderCallback: FeatureFlagProviderCallback

    let httpClient: HttpClientProtocol
    let accountClient: AccountClientProtocol
    let configuration: ProtonDriveClientConfiguration

    private enum OperationIdentifier: Hashable {
        case createFolder(UUID)
        case rename(UUID)
        case getAvailableName(UUID)
        case trash(UUID)

        var operationName: String {
            switch self {
            case .createFolder: return "createFolder"
            case .rename: return "rename"
            case .getAvailableName: return "getAvailableName"
            case .trash: return "trash"
            }
        }
    }

    private var activeOperations: [OperationIdentifier: CancellationTokenSource] = [:]

    public init(
        configuration: ProtonDriveClientConfiguration,
        httpClient: HttpClientProtocol,
        accountClient: AccountClientProtocol,
        logCallback: @escaping LogCallback,
        recordMetricEventCallback: @escaping RecordMetricEventCallback,
        featureFlagProviderCallback: @escaping FeatureFlagProviderCallback,
    ) async throws {
        self.logger = try await Logger(logCallback: logCallback)
        self.recordMetricEventCallback = recordMetricEventCallback
        self.featureFlagProviderCallback = featureFlagProviderCallback

        self.httpClient = httpClient
        self.accountClient = accountClient
        self.configuration = configuration

        let clientCreateRequest = Proton_Drive_Sdk_DriveClientCreateRequest.with {
            $0.baseURL = configuration.baseURL

            $0.accountRequestAction = Int64(ObjectHandle(callback: cCompatibleAccountClientRequest))

            $0.httpClient = Proton_Drive_Sdk_HttpClient.with { httpClient in
                httpClient.requestFunction = Int64(ObjectHandle(callback: HttpClientRequestProcessor.cCompatibleHttpRequest))
                httpClient.responseContentReadAction = Int64(ObjectHandle(callback: HttpClientResponseProcessor.cCompatibleHttpResponseRead))
                httpClient.cancellationAction = Int64(ObjectHandle(callback: HttpClientRequestProcessor.cCompatibleHttpCancellationAction))
            }

            $0.telemetry = Proton_Sdk_Telemetry.with {
                $0.logAction = Int64(ObjectHandle(callback: cCompatibleLogCallback))
                $0.recordMetricAction = Int64(ObjectHandle(callback: cCompatibleTelemetryRecordMetricCallback))
            }

            $0.featureEnabledFunction = Int64(ObjectHandle(callback: cCompatibleFeatureFlagProviderCallback))

            if let entityCachePath = configuration.entityCachePath {
                $0.entityCachePath = entityCachePath
            }
            if let secretCachePath = configuration.secretCachePath {
                $0.secretCachePath = secretCachePath
            }
            if let secretCacheEncryptionKey = configuration.secretCacheEncryptionKey {
                $0.secretCacheEncryptionKey = secretCacheEncryptionKey
            }

            $0.clientOptions = Proton_Drive_Sdk_ProtonDriveClientOptions.with {
                $0.uid = configuration.clientUID
                if let httpApiCallsTimeout = configuration.httpApiCallsTimeout {
                    $0.apiCallTimeout = httpApiCallsTimeout
                }
                if let httpStorageCallsTimeout = configuration.httpStorageCallsTimeout {
                    $0.storageCallTimeout = httpStorageCallsTimeout
                }
            }
        }

        // we pass the weak reference as the state because we don't want the interop layer
        // to prolong the client object existence
        let provider = SDKClientProvider(client: self)
        let handle: Proton_Drive_Sdk_DriveClientCreateRequest.CallResultType = try await SDKRequestHandler.sendInteropRequest(
            clientCreateRequest, state: provider, includesLongLivedCallback: true, logger: logger
        )
        assert(handle != 0)
        self.clientHandle = ObjectHandle(handle)
        logger.trace("client handle: \(clientHandle)", category: "ProtonDriveClient")

        self.uploadsManager = UploadsManager(clientHandle: clientHandle, logger: logger)
        self.downloadsManager = DownloadsManager(clientHandle: clientHandle, logger: logger)
        self.thumbnailsManager = DownloadThumbnailsManager(clientHandle: clientHandle, logger: logger)
    }

    /// Convenience API for when you don't need a more granular control over the download (pause, resume etc.).
    /// Returns `nil` in case of successful completed download.
    /// Returns `VerificationIssue` object if the download completed, but could not be verified.
    /// Throws error in case the download has not completed.
    public func downloadFile(
        revisionUid: SDKRevisionUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback,
        onRetriableErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> VerificationIssue? {
        let operation = try await downloadFileOperation(
            revisionUid: revisionUid,
            destinationUrl: destinationUrl,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
        return try await operation.awaitDownloadWithResilience(
            operationalResilience: configuration.downloadOperationalResilience,
            onRetriableErrorReceived: onRetriableErrorReceived
        )
    }

    public func downloadFileOperation(
        revisionUid: SDKRevisionUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> DownloadOperation {
        try await downloadsManager.downloadFileOperation(
            revisionUid: revisionUid,
            destinationUrl: destinationUrl,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func cancelDownload(cancellationToken: UUID) async throws {
        try await downloadsManager.cancelDownload(with: cancellationToken)
    }

    /// Downloads a file to a seekable output stream with support for pause/resume.
    /// Use this method when you need pause/resume functionality with proper stream seeking.
    /// - Parameters:
    ///   - revisionUid: The revision UID of the file to download
    ///   - outputStream: The seekable output stream to write data to
    ///   - cancellationToken: A unique identifier for this download operation
    ///   - progressCallback: Callback for progress updates
    /// - Returns: A DownloadOperation that supports pause/resume via stream seeking
    public func downloadToStreamOperation(
        revisionUid: SDKRevisionUid,
        outputStream: SeekableOutputStream,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> DownloadOperation {
        try await downloadsManager.downloadToStreamOperation(
            revisionUid: revisionUid,
            outputStream: outputStream,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    /// Convenience API for when you don't need a more granular control over the upload (pause, resume etc.)
    public func uploadFile(
        parentFolderUid: SDKNodeUid,
        name: String,
        url: URL,
        fileSize: Int64,
        modificationDate: Date,
        mediaType: String,
        thumbnails: [ThumbnailData],
        overrideExistingDraft: Bool,
        expectedSha1: Data? = nil,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback,
        onRetriableErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> UploadedFileIdentifiers {
        let operation = try await uploadFileOperation(
            parentFolderUid: parentFolderUid,
            name: name,
            url: url,
            fileSize: fileSize,
            modificationDate: modificationDate,
            mediaType: mediaType,
            thumbnails: thumbnails,
            overrideExistingDraft: overrideExistingDraft,
            expectedSha1: expectedSha1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )

        return try await operation.awaitUploadWithResilience(
            operationalResilience: configuration.uploadOperationalResilience,
            onRetriableErrorReceived: onRetriableErrorReceived
        )
    }

    public func uploadFileOperation(
        parentFolderUid: SDKNodeUid,
        name: String,
        url: URL,
        fileSize: Int64,
        modificationDate: Date,
        mediaType: String,
        thumbnails: [ThumbnailData],
        overrideExistingDraft: Bool,
        expectedSha1: Data? = nil,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadOperation {
        try await uploadsManager.uploadFileOperation(
            parentFolderUid: parentFolderUid,
            name: name,
            fileURL: url,
            fileSize: fileSize,
            modificationDate: modificationDate,
            mediaType: mediaType,
            thumbnails: thumbnails,
            overrideExistingDraft: overrideExistingDraft,
            expectedSha1: expectedSha1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    /// Convenience API for when you don't need a more granular control over the upload (pause, resume etc.)
    public func uploadNewRevision(
        currentActiveRevisionUid: SDKRevisionUid,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        thumbnails: [ThumbnailData],
        expectedSha1: Data? = nil,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback,
        onRetriableErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> UploadedFileIdentifiers {
        let operation = try await uploadNewRevisionOperation(
            currentActiveRevisionUid: currentActiveRevisionUid,
            fileURL: fileURL,
            fileSize: fileSize,
            modificationDate: modificationDate,
            thumbnails: thumbnails,
            expectedSha1: expectedSha1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )

        return try await operation.awaitUploadWithResilience(
            operationalResilience: configuration.uploadOperationalResilience,
            onRetriableErrorReceived: onRetriableErrorReceived
        )
    }

    public func uploadNewRevisionOperation(
        currentActiveRevisionUid: SDKRevisionUid,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        thumbnails: [ThumbnailData],
        expectedSha1: Data? = nil,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadOperation {
        return try await uploadsManager.uploadNewRevisionOperation(
            currentActiveRevisionUid: currentActiveRevisionUid,
            fileURL: fileURL,
            fileSize: fileSize,
            modificationDate: modificationDate,
            thumbnails: thumbnails,
            expectedSha1: expectedSha1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func cancelUpload(cancellationToken: UUID) async throws {
        try await uploadsManager.cancelUpload(with: cancellationToken)
    }

    static func unbox(
        callbackPointer: Int, releaseBox: () -> Void,
        weakDriveClient: WeakReference<ProtonDriveClient>
    ) -> ProtonDriveClient? {
        guard let driveClient = weakDriveClient.value else {
            releaseBox()
            let message = "callback called after the proton client object was deallocated"
            SDKResponseHandler.sendInteropErrorToSDK(message: message,
                                                     callbackPointer: callbackPointer,
                                                     assert: false)
            return nil
        }
        return driveClient
    }

    public func downloadThumbnails(
        fileUids: [SDKNodeUid],
        type: ThumbnailData.ThumbnailType,
        cancellationToken: UUID
    ) async throws -> [ThumbnailDataWithId] {
        try await thumbnailsManager.downloadThumbnails(
            fileUids: fileUids,
            type: type,
            cancellationToken: cancellationToken
        )
    }

    deinit {
        guard clientHandle != 0 else { return }
        Self.freeProtonDriveClient(Int64(clientHandle), logger)
    }

    private func cancelOperation(identifier: OperationIdentifier) async throws {
        guard let cancellationToken = activeOperations[identifier] else {
            throw ProtonDriveSDKError(interopError: .noCancellationTokenForIdentifier(operation: identifier.operationName))
        }

        try await cancellationToken.cancel()

        activeOperations[identifier] = nil
        cancellationToken.free()
    }

    private func createCancellationTokenSource(_ operationIdentifier: OperationIdentifier, _ logger: Logger) async throws -> CancellationTokenSource {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeOperations[operationIdentifier] = cancellationTokenSource
        return cancellationTokenSource
    }

    private func freeCancellationTokenSourceIfNeeded(identifier: OperationIdentifier) {
        guard let cancellationTokenSource = activeOperations[identifier] else { return }
        activeOperations[identifier] = nil
        cancellationTokenSource.free()
    }

    private static func freeProtonDriveClient(_ clientHandle: Int64, _ logger: Logger?) {
        Task {
            let freeRequest = Proton_Drive_Sdk_DriveClientFreeRequest.with {
                $0.clientHandle = clientHandle
            }
            do {
                try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
            } catch {
                // If the request to free the client failed, we have a memory leak, but not much else can be done.
                logger?.error("Proton_Drive_Sdk_DriveClientFreeRequest failed: \(error)",
                              category: "ProtonDriveClient.freeProtonDriveClient")
            }
        }
    }
}

// MARK: - Node action
extension ProtonDriveClient {

    public func createFolder(
        parentFolderUid: SDKNodeUid,
        folderName: String,
        lastModificationTime: Date,
        cancellationToken: UUID
    ) async throws -> FolderNode {
        let cancellationTokenSource = try await createCancellationTokenSource(.createFolder(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .createFolder(cancellationToken))
        }

        let cancellationHandle = cancellationTokenSource.handle

        let createFolderRequest = Proton_Drive_Sdk_DriveClientCreateFolderRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.parentFolderUid = parentFolderUid.sdkCompatibleIdentifier
            $0.folderName = folderName
            $0.lastModificationTime = Google_Protobuf_Timestamp(date: lastModificationTime)
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let sdkFolderNode: Proton_Drive_Sdk_FolderNode = try await SDKRequestHandler.send(createFolderRequest, logger: logger)
        return try FolderNode(sdkFolderNode: sdkFolderNode)
    }

    public func cancelCreateFolder(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .createFolder(cancellationToken))
    }

    public func getAvailableName(
        parentFolderUid: SDKNodeUid,
        name: String,
        cancellationToken: UUID
    ) async throws -> String {
        let cancellationTokenSource = try await createCancellationTokenSource(.getAvailableName(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .getAvailableName(cancellationToken))
        }

        let cancellationHandle = cancellationTokenSource.handle

        let getAvailableNameRequest = Proton_Drive_Sdk_DriveClientGetAvailableNameRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.parentFolderUid = parentFolderUid.sdkCompatibleIdentifier
            $0.name = name
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let nameResult: String = try await SDKRequestHandler.send(getAvailableNameRequest,
                                                                  logger: logger)
        return nameResult
    }

    public func cancelGetAvailableName(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .getAvailableName(cancellationToken))
    }

    public func rename(nodeUid: SDKNodeUid, newName: String, newMediaType: String?, cancellationToken: UUID) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.rename(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .rename(cancellationToken))
        }

        let cancellationHandle = cancellationTokenSource.handle
        let renameRequest = Proton_Drive_Sdk_DriveClientRenameRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUid = nodeUid.sdkCompatibleIdentifier
            $0.newName = newName
            if let newMediaType {
                $0.newMediaType = newMediaType
            }
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }
        let result: Void = try await SDKRequestHandler.send(renameRequest, logger: logger)
    }

    public func cancelRename(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .rename(cancellationToken))
    }

    public func trash(nodes: [SDKNodeUid], cancellationToken: UUID) async throws -> [TrashNodeResult] {
        let cancellationTokenSource = try await createCancellationTokenSource(.trash(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .trash(cancellationToken))
        }

        let cancellationHandle = cancellationTokenSource.handle
        let trashRequest = Proton_Drive_Sdk_DriveClientTrashNodesRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUids = nodes.map { $0.sdkCompatibleIdentifier }
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }
        let result: Proton_Drive_Sdk_TrashNodesResponse = try await SDKRequestHandler.send(trashRequest, logger: logger)
        let results: [TrashNodeResult] = result.results.compactMap { result in
            guard let id = SDKNodeUid(sdkCompatibleIdentifier: result.nodeUid) else { return nil }
            let error: String? = result.hasError ? result.error : nil
            return TrashNodeResult(nodeUid: id, error: error)
        }
        return results
    }

    public func cancelTrash(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .trash(cancellationToken))
    }
}
