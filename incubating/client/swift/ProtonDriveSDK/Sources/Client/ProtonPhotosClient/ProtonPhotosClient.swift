import Foundation

public actor ProtonPhotosClient: Sendable, ProtonSDKClient {

    private var clientHandle: ObjectHandle = 0
    nonisolated(unsafe) var sdkClientProvider: SDKClientProvider!
    private var downloadsManager: PhotoDownloadsManager!
    private var uploadManager: PhotoUploadsManager!
    private var thumbnailsManager: DownloadThumbnailsManager!

    let accountClient: AccountClientProtocol
    let configuration: ProtonDriveClientConfiguration
    let httpClient: HttpClientProtocol
    let logger: ProtonDriveSDK.Logger
    let recordMetricEventCallback: RecordMetricEventCallback
    let featureFlagProviderCallback: FeatureFlagProviderCallback

    private enum OperationIdentifier: Hashable {
        case enumerateTimeline(UUID)
        case findPhotoDuplicates(UUID)
        case enumerateAlbumNodeUids(UUID)
        case enumerateAlbum(UUID)
        case getNode(UUID)
        case leaveSharedNode(UUID)
        case enumerateSharedWithMeNodeUids(UUID)
        case trashNode(UUID)
        case deleteNode(UUID)
        case restoreNode(UUID)
        case emptyTrash(UUID)
        case enumerateTrash(UUID)

        var operationName: String {
            switch self {
            case .enumerateTimeline: return "enumerateTimeline"
            case .findPhotoDuplicates: return "findPhotoDuplicates"
            case .enumerateAlbumNodeUids: return "enumerateAlbumNodeUids"
            case .enumerateAlbum: return "enumerateAlbum"
            case .getNode: return "getNode"
            case .leaveSharedNode: return "leaveSharedNode"
            case .enumerateSharedWithMeNodeUids: return "enumerateSharedWithMeNodeUids"
            case .trashNode: return "trashNode"
            case .deleteNode: return "deleteNode"
            case .restoreNode: return "restoreNode"
            case .emptyTrash: return "emptyTrash"
            case .enumerateTrash: return "enumerateTrash"
            }
        }
    }

    private var activeOperations: [OperationIdentifier: CancellationTokenSource] = [:]

    public init(
        configuration: ProtonDriveClientConfiguration,
        httpClient: HttpClientProtocol,
        accountClient: AccountClientProtocol,
        logCallback: @escaping LogCallback,
        featureFlagProviderCallback: @escaping FeatureFlagProviderCallback,
        recordMetricEventCallback: @escaping RecordMetricEventCallback
    ) async throws {
        self.accountClient = accountClient
        self.configuration = configuration
        self.httpClient = httpClient
        self.logger = try await Logger(logCallback: logCallback)

        self.recordMetricEventCallback = recordMetricEventCallback
        self.featureFlagProviderCallback = featureFlagProviderCallback

        let clientCreateRequest = Proton_Drive_Sdk_DrivePhotosClientCreateRequest.with {
            $0.baseURL = configuration.baseURL

            $0.httpClient = Proton_Drive_Sdk_HttpClient.with { httpClient in
                httpClient.requestFunction = Int64(ObjectHandle(callback: HttpClientRequestProcessor.cCompatibleHttpRequest))
                httpClient.responseContentReadAction = Int64(ObjectHandle(callback: HttpClientResponseProcessor.cCompatibleHttpResponseRead))
                httpClient.responseContentDisposeAction = Int64(ObjectHandle(callback: HttpClientResponseProcessor.cCompatibleHttpResponseDispose))
                httpClient.cancellationAction = Int64(ObjectHandle(callback: HttpClientRequestProcessor.cCompatibleHttpCancellationAction))
            }
            $0.accountRequestAction = Int64(ObjectHandle(callback: cCompatibleAccountClientRequest))

            if let cachePath = configuration.cachePath {
                $0.cachePath = cachePath
            }
            if let cacheEncryptionKey = configuration.cacheEncryptionKey {
                $0.cacheEncryptionKey = cacheEncryptionKey
            }

            $0.telemetry = Proton_Drive_Sdk_Telemetry.with {
                $0.logAction = Int64(ObjectHandle(callback: cCompatibleLogCallback))
                $0.recordMetricAction = Int64(ObjectHandle(callback: cCompatibleTelemetryRecordMetricCallback))
            }

            $0.featureEnabledFunction = Int64(ObjectHandle(callback: cCompatibleFeatureFlagProviderCallback))

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
        let handle: Proton_Drive_Sdk_DrivePhotosClientCreateRequest.CallResultType = try await SDKRequestHandler
            .sendInteropRequest(
                clientCreateRequest,
                state: sdkClientProvider,
                scope: .indefinite,
                owner: nil,
                logger: logger
            )

        assert(handle != 0)
        self.clientHandle = ObjectHandle(handle)
        logger.trace("client handle: \(clientHandle)", category: "ProtonDriveClient")

        self.downloadsManager = PhotoDownloadsManager(clientHandle: clientHandle, logger: logger)
        self.uploadManager = PhotoUploadsManager(clientHandle: clientHandle, logger: logger)
        self.thumbnailsManager = DownloadThumbnailsManager(clientHandle: clientHandle, logger: logger)
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: sdkClientProvider)
        guard clientHandle != 0 else { return }
        Self.freeProtonPhotosClient(Int64(clientHandle), logger)
    }

    private static func freeProtonPhotosClient(_ clientHandle: Int64, _ logger: Logger?) {
        Task {
            let freeRequest = Proton_Drive_Sdk_DrivePhotosClientFreeRequest.with {
                $0.clientHandle = clientHandle
            }
            do {
                try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
            } catch {
                // If the request to free the client failed, we have a memory leak, but not much else can be done.
                logger?.error(
                    "Proton_Drive_Sdk_DrivePhotosClientFreeRequest failed: \(error)",
                    category: "ProtonPhotosClient.freeProtonPhotosClient"
                )
            }
        }
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
}

extension ProtonPhotosClient {
    public func enumerateTimeline(
        in folderUid: SDKNodeUid,
        cancellationToken: UUID,
        onPhotoEnumerated: @escaping PhotoTimelineItemCallback
    ) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.enumerateTimeline(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .enumerateTimeline(cancellationToken))
        }

        let callbackState = TimelineItemEnumerationCallbackWrapper(callback: onPhotoEnumerated)

        let request = Proton_Drive_Sdk_DrivePhotosClientEnumerateTimelineRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
            $0.yieldAction = Int64(ObjectHandle(callback: cTimelineItemEnumerationCallback))
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelEnumerateTimeline(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .enumerateTimeline(cancellationToken))
    }
}

// MARK: - Duplicates

extension ProtonPhotosClient {
    public func findPhotoDuplicates(
        name: String,
        sha1: Data,
        cancellationToken: UUID
    ) async throws -> [SDKNodeUid] {
        let cancellationTokenSource = try await createCancellationTokenSource(.findPhotoDuplicates(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .findPhotoDuplicates(cancellationToken))
        }

        let state = FindDuplicatesState(sha1: sha1)

        let request = Proton_Drive_Sdk_DrivePhotosClientFindDuplicatesRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.name = name
            $0.generateSha1Function = Int64(ObjectHandle(callback: cGenerateSha1CallbackForFindDuplicates))
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let uidStrings: [String] = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: state),
            scope: .ownerManaged,
            owner: state,
            logger: logger
        )

        return uidStrings.compactMap { SDKNodeUid(sdkCompatibleIdentifier: $0) }
    }

    public func cancelFindPhotoDuplicates(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .findPhotoDuplicates(cancellationToken))
    }
}

// MARK: - Albums
extension ProtonPhotosClient {
    /// Enumerates the UIDs of all albums.
    ///
    /// The results are not sorted and the order is not guaranteed.
    public func enumerateAlbumNodeUids(
        cancellationToken: UUID,
        onNodeUidEnumerated: @escaping NodeUidCallback
    ) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.enumerateAlbumNodeUids(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .enumerateAlbumNodeUids(cancellationToken))
        }

        let callbackState = NodeUidEnumerationCallbackWrapper(callback: onNodeUidEnumerated)

        let request = Proton_Drive_Sdk_DrivePhotosClientEnumerateAlbumNodeUidsRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeUidEnumerationCallback))
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelEnumerateAlbumNodeUids(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .enumerateAlbumNodeUids(cancellationToken))
    }

    /// Enumerates the photos of an album, most recent first.
    public func enumerateAlbum(
        albumUid: SDKNodeUid,
        cancellationToken: UUID,
        onAlbumItemEnumerated: @escaping AlbumItemCallback
    ) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.enumerateAlbum(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .enumerateAlbum(cancellationToken))
        }

        let callbackState = AlbumItemEnumerationCallbackWrapper(callback: onAlbumItemEnumerated)

        let request = Proton_Drive_Sdk_DrivePhotosClientEnumerateAlbumRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.albumUid = albumUid.sdkCompatibleIdentifier
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
            $0.yieldAction = Int64(ObjectHandle(callback: cAlbumItemEnumerationCallback))
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    public func cancelEnumerateAlbum(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .enumerateAlbum(cancellationToken))
    }
}

// MARK: - Nodes
extension ProtonPhotosClient {
    /// Fetches a single node (photo, album, or folder) by its UID.
    ///
    /// Album nodes are returned as `DriveNode.album` carrying the album metadata.
    public func getNode(nodeUid: SDKNodeUid, cancellationToken: UUID) async throws -> DriveNode? {
        let cancellationTokenSource = try await createCancellationTokenSource(.getNode(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .getNode(cancellationToken))
        }

        let request = Proton_Drive_Sdk_DrivePhotosClientGetNodeRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUid = nodeUid.sdkCompatibleIdentifier
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let sdkNode: Proton_Drive_Sdk_Node? = try await SDKRequestHandler.send(request, logger: logger)
        guard let sdkNode else { return nil }
        return try DriveNode(sdkNode: sdkNode)
    }

    public func cancelGetNode(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .getNode(cancellationToken))
    }
}

// MARK: - Download
extension ProtonPhotosClient {
    public func downloadThumbnails(
        photoUids: [SDKNodeUid],
        type: ThumbnailData.ThumbnailType,
        cancellationToken: UUID,
        onThumbnailDownloaded: @escaping ThumbnailCallback
    ) async throws {
        try await thumbnailsManager.downloadPhotoThumbnails(
            photoUids: photoUids,
            type: type,
            cancellationToken: cancellationToken,
            onThumbnailDownloaded: onThumbnailDownloaded
        )
    }

    /// Convenience API for when you don't need a more granular control over the download (pause, resume etc.)
    public func download(
        photoUid: SDKNodeUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback,
        onRetriableErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> VerificationIssue? {
        let operation = try await downloadOperation(
            photoUid: photoUid,
            destinationUrl: destinationUrl,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
        return try await operation.awaitDownloadWithResilience(
            operationalResilience: configuration.downloadOperationalResilience,
            onRetriableErrorReceived: onRetriableErrorReceived
        )
    }

    public func cancelPhotoDownload(cancellationToken: UUID) async throws {
        try await downloadsManager.cancelDownload(with: cancellationToken)
    }

    public func downloadOperation(
        photoUid: SDKNodeUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> DownloadOperation {
        try await downloadsManager.downloadPhotoOperation(
            photoUid: photoUid,
            destinationUrl: destinationUrl,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }
}

// MARK: - Upload
extension ProtonPhotosClient {
    public func uploadPhoto(
        name: String,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        captureTime: Date,
        mainPhotoUid: SDKNodeUid?,
        mediaType: String,
        thumbnails: [ThumbnailData],
        tags: [Int],
        additionalMetadata: [AdditionalMetadata],
        expectedSHA1: Data? = nil,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback,
        onRetriableErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> UploadedFileIdentifiers {
        let operation = try await uploadOperation(
            name: name,
            fileURL: fileURL,
            fileSize: fileSize,
            modificationDate: modificationDate,
            captureTime: captureTime,
            mainPhotoUid: mainPhotoUid,
            mediaType: mediaType,
            thumbnails: thumbnails,
            tags: tags,
            additionalMetadata: additionalMetadata,
            expectedSHA1: expectedSHA1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )

        return try await startUpload(
            operation: operation,
            onRetriableErrorReceived: onRetriableErrorReceived
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

    public func uploadOperation(
        name: String,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        captureTime: Date,
        mainPhotoUid: SDKNodeUid?,
        mediaType: String,
        thumbnails: [ThumbnailData],
        tags: [Int],
        additionalMetadata: [AdditionalMetadata],
        expectedSHA1: Data? = nil,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadOperation {
        let mappedTags = tags.compactMap { Proton_Drive_Sdk_PhotoTag(rawValue: $0) }
        guard mappedTags.count == tags.count else {
            let inputTags = Set(tags)
            let knownTags = Set(mappedTags.map(\.rawValue))
            let unknownTags = Array(inputTags.subtracting(knownTags))
            throw ProtonDriveSDKError(interopError: .containsUnknownPhotoTags(tags: unknownTags))
        }

        return try await uploadManager.uploadPhotoOperation(
            name: name,
            fileURL: fileURL,
            fileSize: fileSize,
            modificationDate: modificationDate,
            captureTime: captureTime,
            mainPhotoUid: mainPhotoUid,
            mediaType: mediaType,
            thumbnails: thumbnails,
            tags: mappedTags,
            additionalMetadata: additionalMetadata,
            expectedSHA1: expectedSHA1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func cancelUpload(with token: UUID) async throws {
        try await uploadManager.cancelUpload(with: token)
    }
}

// MARK: - Sharing
extension ProtonPhotosClient {

    public func leaveSharedNode(nodeUid: SDKNodeUid, cancellationToken: UUID) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.leaveSharedNode(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .leaveSharedNode(cancellationToken))
        }

        let request = Proton_Drive_Sdk_DrivePhotosClientLeaveSharedNodeRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUid = nodeUid.sdkCompatibleIdentifier
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let _: Void = try await SDKRequestHandler.send(request, logger: logger)
    }

    public func cancelLeaveSharedNode(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .leaveSharedNode(cancellationToken))
    }

    /// Enumerates the UIDs of all photo nodes that the current user has shared by them.
    ///
    /// The results are not sorted and the order is not guaranteed.
    public func enumerateSharedNodeUids(onNodeUidEnumerated: @escaping NodeUidCallback) async throws {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        defer {
            cancellationTokenSource.free()
        }

        let callbackState = NodeUidEnumerationCallbackWrapper(callback: onNodeUidEnumerated)
        let request = Proton_Drive_Sdk_DrivePhotosClientEnumerateSharedNodeUidsRequest.with {
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

    /// Enumerates the UIDs of all photo nodes (including shared albums) that have been shared with the current user.
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
        let request = Proton_Drive_Sdk_DrivePhotosClientEnumerateSharedWithMeNodeUidsRequest.with {
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
}

// MARK: - Tags

extension ProtonPhotosClient {
    /// Adds and/or removes tags on the given photos, streaming a per-photo result as each update completes.
    public func updatePhotos(_ updates: [PhotoTagsUpdate], onNodeResult: @escaping NodeResultCallback) async throws {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        defer {
            cancellationTokenSource.free()
        }

        let sdkUpdates: [Proton_Drive_Sdk_PhotoTagsUpdate] = try updates.map { update in
            var proto = Proton_Drive_Sdk_PhotoTagsUpdate()
            proto.nodeUid = update.nodeUid.sdkCompatibleIdentifier
            proto.tagsToAdd = try Self.mapPhotoTags(update.tagsToAdd)
            proto.tagsToRemove = try Self.mapPhotoTags(update.tagsToRemove)
            return proto
        }

        let callbackState = NodeResultEnumerationCallbackWrapper(callback: onNodeResult)
        let request = Proton_Drive_Sdk_DrivePhotosClientUpdatePhotosRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.updates = sdkUpdates
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
            $0.yieldAction = Int64(ObjectHandle(callback: cNodeResultEnumerationCallback))
        }

        let _: Void = try await SDKRequestHandler.send(
            request,
            state: WeakReference(value: callbackState),
            scope: .ownerManaged,
            owner: callbackState,
            logger: logger
        )
    }

    private static func mapPhotoTags(_ tags: [PhotoTag]) throws -> [Proton_Drive_Sdk_PhotoTag] {
        let mappedTags = tags.compactMap { Proton_Drive_Sdk_PhotoTag(rawValue: $0.rawValue) }
        guard mappedTags.count == tags.count else {
            let unknownTags = Array(Set(tags.map(\.rawValue)).subtracting(Set(mappedTags.map(\.rawValue))))
            throw ProtonDriveSDKError(interopError: .containsUnknownPhotoTags(tags: unknownTags))
        }
        return mappedTags
    }
}

// MARK: Trash operations
extension ProtonPhotosClient {
    public func trash(nodes: [SDKNodeUid], cancellationToken: UUID, onNodeResult: @escaping NodeResultCallback) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.trashNode(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .trashNode(cancellationToken))
        }
        let callbackState = NodeResultEnumerationCallbackWrapper(callback: onNodeResult)
        let trashRequest = Proton_Drive_Sdk_DrivePhotosClientTrashNodesRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.nodeUids = nodes.map(\.sdkCompatibleIdentifier)
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
        let deleteRequest = Proton_Drive_Sdk_DrivePhotosClientDeleteNodesRequest.with {
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
        let restoreRequest = Proton_Drive_Sdk_DrivePhotosClientRestoreNodesRequest.with {
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

    public func emptyTrash(cancellationToken: UUID) async throws {
        let cancellationTokenSource = try await createCancellationTokenSource(.emptyTrash(cancellationToken), logger)
        defer {
            freeCancellationTokenSourceIfNeeded(identifier: .emptyTrash(cancellationToken))
        }

        let emptyTrashRequest = Proton_Drive_Sdk_DrivePhotosClientEmptyTrashRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let _: Void = try await SDKRequestHandler.send(emptyTrashRequest, logger: logger)
    }

    public func cancelEmptyTrash(cancellationToken: UUID) async throws {
        try await cancelOperation(identifier: .emptyTrash(cancellationToken))
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
        let request = Proton_Drive_Sdk_DrivePhotosClientEnumerateTrashRequest.with {
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
}
