import Foundation

/// Main entry point for all SDK functionality.
///
/// Create a single object of this class and use it to perform downloads, uploads and all other supported operations.
public actor ProtonDriveClient: Sendable {

    private var clientHandle: ObjectHandle!

    private var uploadManager: UploadManager!
    private var downloadManager: DownloadManager!
    private var thumbnailsManager: DownloadThumbnailsManager!

    let logger: ProtonDriveSDK.Logger
    private let recordMetricEventCallback: RecordMetricEventCallback
    private let featureFlagProviderCallback: FeatureFlagProviderCallback

    let httpClient: HttpClientProtocol
    let accountClient: AccountClientProtocol
    let configuration: ProtonDriveClientConfiguration

    public init(
        baseURL: String,
        entityCachePath: String? = nil,
        secretCachePath: String? = nil,
        httpClient: HttpClientProtocol,
        accountClient: AccountClientProtocol,
        clientUID: String?,
        configuration: ProtonDriveClientConfiguration = .default,
        logCallback: @escaping LogCallback,
        recordMetricEventCallback: @escaping RecordMetricEventCallback,
        featureFlagProviderCallback: @escaping FeatureFlagProviderCallback
    ) async throws {
        self.logger = try await Logger(logCallback: logCallback)
        self.recordMetricEventCallback = recordMetricEventCallback
        self.featureFlagProviderCallback = featureFlagProviderCallback

        self.httpClient = httpClient
        self.accountClient = accountClient
        self.configuration = configuration

        let clientCreateRequest = Proton_Drive_Sdk_DriveClientCreateRequest.with {
            $0.baseURL = baseURL

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

            if let entityCachePath {
                $0.entityCachePath = entityCachePath
            }
            if let secretCachePath {
                $0.secretCachePath = secretCachePath
            }
            if let clientUID {
                $0.uid = clientUID
            }
        }

        // we pass the weak reference as the state because we don't want the interop layer
        // to prolong the client object existence
        let weakSelf = WeakReference(value: self)
        let handle: Proton_Drive_Sdk_DriveClientCreateRequest.CallResultType = try await SDKRequestHandler.sendInteropRequest(
            clientCreateRequest, state: weakSelf, includesLongLivedCallback: true, logger: logger
        )
        self.clientHandle = ObjectHandle(handle)
        logger.trace("client handle: \(clientHandle)", category: "ProtonDriveClient")

        self.uploadManager = UploadManager(clientHandle: clientHandle, logger: logger)
        self.downloadManager = DownloadManager(clientHandle: clientHandle, logger: logger)
        self.thumbnailsManager = DownloadThumbnailsManager(clientHandle: clientHandle, logger: logger)
    }

    nonisolated func log(_ logEvent: LogEvent) {
        logger.logCallback(logEvent)
    }

    nonisolated func record(_ metricEvent: MetricEvent) {
        recordMetricEventCallback(metricEvent)
    }

//    nonisolated func isFlagEnabled(_ flagName: String) async -> Bool {
//        await featureFlagProviderCallback(flagName)
//    }
    
    nonisolated func isFlagEnabled(_ flagName: String) -> Bool {
        // Since the C# callback expects a synchronous return but our Swift callback has completion block,
        // we need to block and wait for the async result using a semaphore
        let semaphore = DispatchSemaphore(value: 0)
        var result = false
        featureFlagProviderCallback(flagName) { resultValue in
            result = resultValue
            semaphore.signal()
        }
        semaphore.wait()
        return result
    }

    public func downloadFile(
        revisionUid: SDKRevisionUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws {
        try await downloadManager.downloadFile(
            revisionUid: revisionUid,
            destinationUrl: destinationUrl,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func cancelDownload(cancellationToken: UUID) async throws {
        try await downloadManager.cancelDownload(with: cancellationToken)
    }

    public func uploadFile(
        parentFolderUid: SDKNodeUid,
        name: String,
        url: URL,
        fileSize: Int64,
        modificationDate: Date,
        mediaType: String,
        thumbnails: [ThumbnailData],
        overrideExistingDraft: Bool,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> FileNodeUploadResult {
        try await uploadManager.uploadFile(
            parentFolderUid: parentFolderUid,
            name: name,
            fileURL: url,
            fileSize: fileSize,
            modificationDate: modificationDate,
            mediaType: mediaType,
            thumbnails: thumbnails,
            overrideExistingDraft: overrideExistingDraft,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func uploadNewRevision(
        currentActiveRevisionUid: SDKRevisionUid,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        thumbnails: [ThumbnailData],
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> FileNodeUploadResult {
        try await uploadManager.uploadNewRevision(
            currentActiveRevisionUid: currentActiveRevisionUid,
            fileURL: fileURL,
            fileSize: fileSize,
            modificationDate: modificationDate,
            thumbnails: thumbnails,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }

    public func getAvailableName(
        parentFolderUid: SDKNodeUid,
        name: String
    ) async throws -> String {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        defer {
            // TODO: Should be done in deinit!
            cancellationTokenSource.free()
        }

        let cancellationHandle = cancellationTokenSource.handle

        let getAvailableNameRequest = Proton_Drive_Sdk_DriveClientGetAvailableNameRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.parentFolderUid = parentFolderUid.sdkCompatibleIdentifier
            $0.name = name
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let nameResult: String = try await SDKRequestHandler.send(getAvailableNameRequest, logger: logger)
        return nameResult
    }

    public func cancelUpload(cancellationToken: UUID) async throws {
        try await uploadManager.cancelUpload(with: cancellationToken)
    }

    static func unbox(callbackPointer: Int, releaseBox: () -> Void, weakDriveClient: WeakReference<ProtonDriveClient>) -> ProtonDriveClient? {
        guard let driveClient = weakDriveClient.value else {
            releaseBox()
            let error = Proton_Sdk_Error.with {
                $0.type = "sdk_error"
                $0.domain = Proton_Sdk_ErrorDomain.api
                $0.context = "account client callback called after the proton client object was deallocated"
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: error)
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
}
