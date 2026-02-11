import Foundation

public actor ProtonPhotosClient: Sendable, ProtonSDKClient {

    private var clientHandle: ObjectHandle = 0
    private var downloadsManager: PhotoDownloadsManager!
    private var uploadManager: PhotoUploadsManager!
    private var thumbnailsManager: DownloadThumbnailsManager!

    let accountClient: AccountClientProtocol
    let configuration: ProtonDriveClientConfiguration
    let httpClient: HttpClientProtocol
    let logger: ProtonDriveSDK.Logger
    let recordMetricEventCallback: RecordMetricEventCallback
    let featureFlagProviderCallback: FeatureFlagProviderCallback

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
                httpClient.cancellationAction = Int64(ObjectHandle(callback: HttpClientRequestProcessor.cCompatibleHttpCancellationAction))
            }
            $0.accountRequestAction = Int64(ObjectHandle(callback: cCompatibleAccountClientRequest))

            if let entityCachePath = configuration.entityCachePath {
                $0.entityCachePath = entityCachePath
            }
            if let secretCachePath = configuration.secretCachePath {
                $0.secretCachePath = secretCachePath
            }

            $0.telemetry = Proton_Sdk_Telemetry.with {
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
        let provider = SDKClientProvider(client: self)
        let handle: Proton_Drive_Sdk_DrivePhotosClientCreateRequest.CallResultType = try await SDKRequestHandler
            .sendInteropRequest(
                clientCreateRequest,
                state: provider,
                includesLongLivedCallback: true,
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
}

extension ProtonPhotosClient {
    public func enumerateTimeline(in folderUid: SDKNodeUid) async throws -> [PhotoTimelineItem] {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        defer {
            cancellationTokenSource.free()
        }

        let cancellationHandle = cancellationTokenSource.handle

        let request = Proton_Drive_Sdk_DrivePhotosClientEnumerateTimelineRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let list: Proton_Drive_Sdk_PhotosTimelineList = try await SDKRequestHandler.send(request, logger: logger)
        return list.items.compactMap { PhotoTimelineItem(item: $0) }
    }
}

// MARK: - Download
extension ProtonPhotosClient {
    public func downloadThumbnails(
        photoUids: [SDKNodeUid],
        type: ThumbnailData.ThumbnailType,
        cancellationToken: UUID
    ) async throws -> [ThumbnailDataWithId] {
        try await thumbnailsManager.downloadPhotoThumbnails(
            photoUids: photoUids,
            type: type,
            cancellationToken: cancellationToken
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
        mainPhotoLinkID: String?,
        mediaType: String,
        thumbnails: [ThumbnailData],
        tags: [Int],
        additionalMetadata: [AdditionalMetadata],
        overrideExistingDraft: Bool,
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
            mainPhotoLinkID: mainPhotoLinkID,
            mediaType: mediaType,
            thumbnails: thumbnails,
            tags: tags,
            additionalMetadata: additionalMetadata,
            overrideExistingDraft: overrideExistingDraft,
            expectedSHA1: expectedSHA1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )

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
        mainPhotoLinkID: String?,
        mediaType: String,
        thumbnails: [ThumbnailData],
        tags: [Int],
        additionalMetadata: [AdditionalMetadata],
        overrideExistingDraft: Bool,
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
            mainPhotoLinkID: mainPhotoLinkID,
            mediaType: mediaType,
            thumbnails: thumbnails,
            tags: mappedTags,
            additionalMetadata: additionalMetadata,
            overrideExistingDraft: overrideExistingDraft,
            expectedSHA1: expectedSHA1,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func cancelUpload(with token: UUID) async throws {
        try await uploadManager.cancelUpload(with: token)
    }
}
