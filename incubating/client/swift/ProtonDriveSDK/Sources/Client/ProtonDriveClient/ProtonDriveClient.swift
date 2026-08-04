import Foundation
import SwiftProtobuf

/// Main entry point for all SDK functionality.
///
/// Create a single object of this class and use it to perform downloads, uploads and all other supported operations.
public actor ProtonDriveClient: Sendable, ProtonSDKClient {

    private var clientHandle: ObjectHandle = 0
    nonisolated(unsafe) var sdkClientProvider: SDKClientProvider!

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
        case moveNodes(UUID)
        case getAvailableName(UUID)
        case getNode(UUID)
        case getMyFilesRootFolder(UUID)
        case enumerateFolderChildren(UUID)
        case trashNode(UUID)
        case deleteNode(UUID)
        case restoreNode(UUID)
        case enumerateTrash(UUID)
        case emptyTrash(UUID)
        case enumerateDevices(UUID)
        case createDevice(UUID)
        case renameDevice(UUID)
        case deleteDevice(UUID)
        case leaveSharedNode(UUID)
        case enumerateSharedWithMeNodeUids(UUID)
        case enumerateSharedNodeUids(UUID)

        var operationName: String {
            switch self {
            case .createFolder: return "createFolder"
            case .rename: return "rename"
            case .moveNodes: return "moveNodes"
            case .getAvailableName: return "getAvailableName"
            case .getNode: return "getNode"
            case .getMyFilesRootFolder: return "getMyFilesRootFolder"
            case .enumerateFolderChildren: return "enumerateFolderChildren"
            case .trashNode: return "trashNode"
            case .deleteNode: return "deleteNode"
            case .restoreNode: return "restoreNode"
            case .enumerateTrash: return "enumerateTrash"
            case .emptyTrash: return "emptyTrash"
            case .enumerateDevices: return "enumerateDevices"
            case .createDevice: return "createDevice"
            case .renameDevice: return "renameDevice"
            case .deleteDevice: return "deleteDevice"
            case .leaveSharedNode: return "leaveSharedNode"
            case .enumerateSharedWithMeNodeUids: return "enumerateSharedWithMeNodeUids"
            case .enumerateSharedNodeUids: return "enumerateSharedNodeUids"
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
                httpClient.responseContentDisposeAction = Int64(ObjectHandle(callback: HttpClientResponseProcessor.cCompatibleHttpResponseDispose))
                httpClient.cancellationAction = Int64(ObjectHandle(callback: HttpClientRequestProcessor.cCompatibleHttpCancellationAction))
            }

            $0.telemetry = Proton_Drive_Sdk_Telemetry.with {
                $0.logAction = Int64(ObjectHandle(callback: cCompatibleLogCallback))
                $0.recordMetricAction = Int64(ObjectHandle(callback: cCompatibleTelemetryRecordMetricCallback))
            }

            $0.featureEnabledFunction = Int64(ObjectHandle(callback: cCompatibleFeatureFlagProviderCallback))

            if let cachePath = configuration.cachePath {
                $0.cachePath = cachePath
            }
            if let cacheEncryptionKey = configuration.cacheEncryptionKey {
                $0.cacheEncryptionKey = cacheEncryptionKey
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
        // owner is nil: the client creation callback must outlive the client because C# may
        // invoke secondary callbacks (log, telemetry, etc.) during teardown of operations that
        // race with the client's deinit. SDKClientProvider.client is weak, so callbacks bail
        // out safely once the client is gone; the small leak of the box is acceptable.
        self.sdkClientProvider = SDKClientProvider(client: self)
        let handle: Proton_Drive_Sdk_DriveClientCreateRequest.CallResultType = try await SDKRequestHandler.sendInteropRequest(
            clientCreateRequest, state: sdkClientProvider, scope: .indefinite, owner: nil, logger: logger
        )
        assert(handle != 0)
        self.clientHandle = ObjectHandle(handle)
        logger.trace("client handle: \(clientHandle)", category: "ProtonDriveClient")

        self.uploadsManager = UploadsManager(clientHandle: clientHandle, logger: logger)
        self.downloadsManager = DownloadsManager(clientHandle: clientHandle, logger: logger)
        self.thumbnailsManager = DownloadThumbnailsManager(clientHandle: clientHandle, logger: logger)
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
        cancellationToken: UUID,
        onThumbnailDownloaded: @escaping ThumbnailCallback
    ) async throws {
        try await thumbnailsManager.downloadThumbnails(
            fileUids: fileUids,
            type: type,
            cancellationToken: cancellationToken,
            onThumbnailDownloaded: onThumbnailDownloaded
        )
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: sdkClientProvider)
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

// MARK: - Download file
extension ProtonDriveClient {
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

    public func cancelDownload(cancellationToken: UUID) async throws {
        try await downloadsManager.cancelDownload(with: cancellationToken)
    }
}

// MARK: - Upload file
extension ProtonDriveClient {
    /// Convenience API for when you don't need a more granular control over the upload (pause, resume etc.)
    public func uploadFile(
        parentFolderUid: SDKNodeUid,
        name: String,
        url: URL,
        fileSize: Int64,
        modificationDate: Date?,
        mediaType: String,
        thumbnails: [ThumbnailData],
        overrideExistingDraft: Bool,
        expectedSHA1: Data? = nil,
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
            expectedSHA1: expectedSHA1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )

        return try await startUpload(
            operation: operation,
            onRetriableErrorReceived: onRetriableErrorReceived
        )
    }

    public func uploadFileOperation(
        parentFolderUid: SDKNodeUid,
        name: String,
        url: URL,
        fileSize: Int64,
        modificationDate: Date?,
        mediaType: String,
        thumbnails: [ThumbnailData],
        overrideExistingDraft: Bool,
        expectedSHA1: Data? = nil,
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
            expectedSHA1: expectedSHA1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func startUpload(
        operation: UploadOperation,
        onRetriableErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> UploadedFileIdentifiers {
        if try await operation.isPaused() {
            try await operation.resume()
        }
        return try await operation.awaitUploadWithResilience(
            operationalResilience: configuration.uploadOperationalResilience,
            onRetriableErrorReceived: onRetriableErrorReceived
        )
    }

    /// Convenience API for when you don't need a more granular control over the upload (pause, resume etc.)
    public func uploadNewRevision(
        currentActiveRevisionUid: SDKRevisionUid,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date?,
        thumbnails: [ThumbnailData],
        expectedSHA1: Data? = nil,
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
            expectedSHA1: expectedSHA1,
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
        modificationDate: Date?,
        thumbnails: [ThumbnailData],
        expectedSHA1: Data? = nil,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadOperation {
        return try await uploadsManager.uploadNewRevisionOperation(
            currentActiveRevisionUid: currentActiveRevisionUid,
            fileURL: fileURL,
            fileSize: fileSize,
            modificationDate: modificationDate,
            thumbnails: thumbnails,
            expectedSHA1: expectedSHA1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func cancelUpload(cancellationToken: UUID) async throws {
        try await uploadsManager.cancelUpload(with: cancellationToken)
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

        let sdkNode: Proton_Drive_Sdk_Node = try await SDKRequestHandler.send(createFolderRequest, logger: logger)
        guard case .folder(let sdkFolderNode) = sdkNode.node else {
            throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "createFolder expected FolderNode, got \(sdkNode.node as Any)"))
        }
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

    public func getMyFilesRootFolder(cancellationToken: UUID) async throws -> FolderNode {
        let cancellationTokenSource = try await createCancellationTokenSource(.getMyFilesRootFolder(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .getMyFilesRootFolder(cancellationToken))
        }

        let getMyFilesFolderRequest = Proton_Drive_Sdk_DriveClientGetMyFilesFolderRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let sdkNode: Proton_Drive_Sdk_Node = try await SDKRequestHandler.send(getMyFilesFolderRequest, logger: logger)
        guard case .folder(let sdkFolderNode) = sdkNode.node else {
            throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "getMyFilesRootFolder expected FolderNode, got \(sdkNode.node as Any)"))
        }
        return try FolderNode(sdkFolderNode: sdkFolderNode)
    }

    public func cancelGetMyFilesRootFolder(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .getMyFilesRootFolder(cancellationToken))
    }

    public func getNode(nodeUid: SDKNodeUid, cancellationToken: UUID) async throws -> DriveNode? {
        let cancellationTokenSource = try await createCancellationTokenSource(.getNode(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .getNode(cancellationToken))
        }

        let getNodeRequest = Proton_Drive_Sdk_DriveClientGetNodeRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUid = nodeUid.sdkCompatibleIdentifier
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let sdkNode: Proton_Drive_Sdk_Node? = try await SDKRequestHandler.send(getNodeRequest, logger: logger)
        guard let sdkNode else { return nil }
        return try DriveNode(sdkNode: sdkNode)
    }

    public func cancelGetNode(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .getNode(cancellationToken))
    }

    public func enumerateFolderChildrenNodeUids(
        folderUid: SDKNodeUid,
        cancellationToken: UUID,
        onNodeUidEnumerated: @escaping NodeUidCallback
    ) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.enumerateFolderChildren(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .enumerateFolderChildren(cancellationToken))
        }

        let callbackState = NodeUidEnumerationCallbackWrapper(callback: onNodeUidEnumerated)
        let request = Proton_Drive_Sdk_DriveClientEnumerateFolderChildrenRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.folderUid = folderUid.sdkCompatibleIdentifier
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeUidEnumerationCallback))
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelEnumerateFolderChildren(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .enumerateFolderChildren(cancellationToken))
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
        let _: Void = try await SDKRequestHandler.send(renameRequest, logger: logger)
    }

    public func cancelRename(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .rename(cancellationToken))
    }

    public func moveNodes(nodeUids: [SDKNodeUid], newParentFolderUid: SDKNodeUid, cancellationToken: UUID) async throws -> [NodeResult] {
        let cancellationTokenSource = try await createCancellationTokenSource(.moveNodes(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .moveNodes(cancellationToken))
        }

        let cancellationHandle = cancellationTokenSource.handle
        let moveRequest = Proton_Drive_Sdk_DriveClientMoveNodesRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUids = nodeUids.map { $0.sdkCompatibleIdentifier }
            $0.newParentFolderUid = newParentFolderUid.sdkCompatibleIdentifier
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }
        let result: Proton_Drive_Sdk_NodeResultListResponse = try await SDKRequestHandler.send(moveRequest, logger: logger)
        return result.results.compactMap { NodeResult(sdkNodeResult: $0) }
    }

    public func cancelMoveNodes(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .moveNodes(cancellationToken))
    }

}

// MARK: - Trash 
extension ProtonDriveClient {
    public func trash(nodes: [SDKNodeUid], cancellationToken: UUID, onNodeResult: @escaping NodeResultCallback) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.trashNode(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .trashNode(cancellationToken))
        }

        let callbackState = NodeResultEnumerationCallbackWrapper(callback: onNodeResult)
        let trashRequest = Proton_Drive_Sdk_DriveClientTrashNodesRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUids = nodes.map { $0.sdkCompatibleIdentifier }
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeResultEnumerationCallback))
        }
        let _: Void = try await SDKRequestHandler.send(
            trashRequest,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelTrash(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .trashNode(cancellationToken))
    }

    public func delete(nodes: [SDKNodeUid], cancellationToken: UUID, onNodeResult: @escaping NodeResultCallback) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.deleteNode(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .deleteNode(cancellationToken))
        }

        let callbackState = NodeResultEnumerationCallbackWrapper(callback: onNodeResult)
        let deleteRequest = Proton_Drive_Sdk_DriveClientDeleteNodesRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUids = nodes.map { $0.sdkCompatibleIdentifier }
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeResultEnumerationCallback))
        }

        let _: Void = try await SDKRequestHandler.send(
            deleteRequest,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelDelete(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .deleteNode(cancellationToken))
    }

    public func restore(nodes: [SDKNodeUid], cancellationToken: UUID, onNodeResult: @escaping NodeResultCallback) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.restoreNode(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .restoreNode(cancellationToken))
        }

        let callbackState = NodeResultEnumerationCallbackWrapper(callback: onNodeResult)
        let restoreRequest = Proton_Drive_Sdk_DriveClientRestoreNodesRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUids = nodes.map { $0.sdkCompatibleIdentifier }
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeResultEnumerationCallback))
        }

        let _: Void = try await SDKRequestHandler.send(
            restoreRequest,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelRestore(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .restoreNode(cancellationToken))
    }

    public func enumerateTrashNodeUids(
        cancellationToken: UUID,
        onNodeUidEnumerated: @escaping NodeUidCallback
    ) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.enumerateTrash(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .enumerateTrash(cancellationToken))
        }

        let callbackState = NodeUidEnumerationCallbackWrapper(callback: onNodeUidEnumerated)
        let request = Proton_Drive_Sdk_DriveClientEnumerateTrashRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeUidEnumerationCallback))
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelEnumerateTrash(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .enumerateTrash(cancellationToken))
    }

    public func emptyTrash(cancellationToken: UUID) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.emptyTrash(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .emptyTrash(cancellationToken))
        }

        let emptyTrashRequest = Proton_Drive_Sdk_DriveClientEmptyTrashRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let _: Void = try await SDKRequestHandler.send(emptyTrashRequest, logger: logger)
    }

    public func cancelEmptyTrash(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .emptyTrash(cancellationToken))
    }
}

// MARK: - Sharing
extension ProtonDriveClient {

    public func leaveSharedNode(nodeUid: SDKNodeUid, cancellationToken: UUID) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.leaveSharedNode(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .leaveSharedNode(cancellationToken))
        }

        let leaveSharedNodeRequest = Proton_Drive_Sdk_DriveClientLeaveSharedNodeRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUid = nodeUid.sdkCompatibleIdentifier
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let _: Void = try await SDKRequestHandler.send(leaveSharedNodeRequest, logger: logger)
    }

    public func cancelLeaveSharedNode(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .leaveSharedNode(cancellationToken))
    }

    /// Enumerates the UIDs of all nodes that have been shared with the current user.
    ///
    /// The results are not sorted and the order is not guaranteed.
    public func enumerateSharedWithMeNodeUids(
        cancellationToken: UUID,
        onNodeUidEnumerated: @escaping NodeUidCallback
    ) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.enumerateSharedWithMeNodeUids(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .enumerateSharedWithMeNodeUids(cancellationToken))
        }

        let callbackState = NodeUidEnumerationCallbackWrapper(callback: onNodeUidEnumerated)
        let request = Proton_Drive_Sdk_DriveClientEnumerateSharedWithMeNodeUidsRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeUidEnumerationCallback))
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelEnumerateSharedWithMeNodeUids(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .enumerateSharedWithMeNodeUids(cancellationToken))
    }

    /// Enumerates the UIDs of all own nodes that have been shared by the current user.
    ///
    /// The results are not sorted and the order is not guaranteed.
    public func enumerateSharedNodeUids(
        cancellationToken: UUID,
        onNodeUidEnumerated: @escaping NodeUidCallback
    ) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.enumerateSharedNodeUids(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .enumerateSharedNodeUids(cancellationToken))
        }

        let callbackState = NodeUidEnumerationCallbackWrapper(callback: onNodeUidEnumerated)
        let request = Proton_Drive_Sdk_DriveClientEnumerateSharedNodeUidsRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeUidEnumerationCallback))
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelEnumerateSharedNodeUids(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .enumerateSharedNodeUids(cancellationToken))
    }
}

// MARK: - Device action
extension ProtonDriveClient {

    public func enumerateDevices(
        cancellationToken: UUID,
        onDeviceEnumerated: @escaping DeviceCallback
    ) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.enumerateDevices(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .enumerateDevices(cancellationToken))
        }

        let callbackState = DeviceEnumerationCallbackWrapper(callback: onDeviceEnumerated)
        let request = Proton_Drive_Sdk_DriveClientEnumerateDevicesRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
            $0.yieldAction = Int64(ObjectHandle(callback: cDeviceEnumerationCallback))
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelEnumerateDevices(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .enumerateDevices(cancellationToken))
    }

    public func createDevice(name: String, type: DeviceType, cancellationToken: UUID) async throws -> Device {
        let cancellationTokenSource = try await createCancellationTokenSource(.createDevice(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .createDevice(cancellationToken))
        }

        let cancellationHandle = cancellationTokenSource.handle
        let request = Proton_Drive_Sdk_DriveClientCreateDeviceRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.name = name
            $0.deviceType = type.sdkType
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let sdkDevice: Proton_Drive_Sdk_Device = try await SDKRequestHandler.send(request, logger: logger)
        return try Device(sdkDevice: sdkDevice)
    }

    public func cancelCreateDevice(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .createDevice(cancellationToken))
    }

    public func renameDevice(deviceUid: SDKDeviceUid, newName: String, cancellationToken: UUID) async throws -> Device {
        let cancellationTokenSource = try await createCancellationTokenSource(.renameDevice(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .renameDevice(cancellationToken))
        }

        let cancellationHandle = cancellationTokenSource.handle
        let request = Proton_Drive_Sdk_DriveClientRenameDeviceRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.deviceUid = deviceUid.sdkCompatibleIdentifier
            $0.name = newName
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let sdkDevice: Proton_Drive_Sdk_Device = try await SDKRequestHandler.send(request, logger: logger)
        return try Device(sdkDevice: sdkDevice)
    }

    public func cancelRenameDevice(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .renameDevice(cancellationToken))
    }

    public func deleteDevice(deviceUid: SDKDeviceUid, cancellationToken: UUID) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.deleteDevice(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .deleteDevice(cancellationToken))
        }

        let cancellationHandle = cancellationTokenSource.handle
        let request = Proton_Drive_Sdk_DriveClientDeleteDeviceRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.deviceUid = deviceUid.sdkCompatibleIdentifier
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let _: Void = try await SDKRequestHandler.send(request, logger: logger)
    }

    public func cancelDeleteDevice(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .deleteDevice(cancellationToken))
    }
}
