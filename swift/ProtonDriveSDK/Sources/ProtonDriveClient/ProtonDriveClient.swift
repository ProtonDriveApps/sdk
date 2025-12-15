import Foundation

/// Main entry point for all SDK functionality.
///
/// Create a single object of this class and use it to perform downloads, uploads and all other supported operations.
public actor ProtonDriveClient: Sendable {

    private var clientHandle: ObjectHandle = 0

    private var uploadsManager: UploadsManager!
    private var downloadsManager: DownloadsManager!
    private var thumbnailsManager: DownloadThumbnailsManager!

    let logger: ProtonDriveSDK.Logger
    private let recordMetricEventCallback: RecordMetricEventCallback
    private let featureFlagProviderCallback: FeatureFlagProviderCallback

    let httpClient: HttpClientProtocol
    let accountClient: AccountClientProtocol
    let configuration: ProtonDriveClientConfiguration

    public init(
        configuration: ProtonDriveClientConfiguration,
        httpClient: HttpClientProtocol,
        accountClient: AccountClientProtocol,
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
            $0.baseURL = configuration.baseURL
            
            $0.uid = configuration.clientUID

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
        }

        // we pass the weak reference as the state because we don't want the interop layer
        // to prolong the client object existence
        let weakSelf = WeakReference(value: self)
        let handle: Proton_Drive_Sdk_DriveClientCreateRequest.CallResultType = try await SDKRequestHandler.sendInteropRequest(
            clientCreateRequest, state: weakSelf, includesLongLivedCallback: true, logger: logger
        )
        assert(handle != 0)
        self.clientHandle = ObjectHandle(handle)
        logger.trace("client handle: \(clientHandle)", category: "ProtonDriveClient")

        self.uploadsManager = UploadsManager(clientHandle: clientHandle, logger: logger)
        self.downloadsManager = DownloadsManager(clientHandle: clientHandle, logger: logger)
        self.thumbnailsManager = DownloadThumbnailsManager(clientHandle: clientHandle, logger: logger)
    }

    nonisolated func log(_ logEvent: LogEvent) {
        logger.logCallback(logEvent)
    }

    nonisolated func record(_ metricEvent: MetricEvent) {
        recordMetricEventCallback(metricEvent)
    }

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

    /// Convenience API for when you don't need a more granular control over the download (pause, resume etc.)
    public func downloadFile(
        revisionUid: SDKRevisionUid,
        destinationUrl: URL,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws {
        let operation = try await downloadFileOperation(
            revisionUid: revisionUid,
            destinationUrl: destinationUrl,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
        return try await awaitDownloadCompletion(operation: operation, retryCounter: 0)
    }
    
    private func awaitDownloadCompletion(
        operation: DownloadOperation, retryCounter: UInt
    ) async throws {
        let result = await operation.awaitDownloadCompletion()
        switch result {
        case .succeeded:
            return
        
        case .failed(let error):
            throw error
        
        case .pausedOnError(let error):
            return try await configuration.downloadOperationalResilience.performRetry(retryCounter, error) {
                try await operation.resume()
                return try await awaitDownloadCompletion(operation: operation, retryCounter: $0)
            }
        }
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
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
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
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
        
        return try await awaitUploadCompletion(operation: operation, retryCounter: 0)
    }
    
    private func awaitUploadCompletion(
        operation: UploadOperation, retryCounter: UInt
    ) async throws -> UploadedFileIdentifiers {
        let result = await operation.awaitUploadCompletion()
        switch result {
        case .succeeded(let uploadResult):
            return uploadResult
        
        case .failed(let error):
            throw error
        
        case .pausedOnError(let error):
            return try await configuration.uploadOperationalResilience.performRetry(retryCounter, error) {
                try await operation.resume()
                return try await awaitUploadCompletion(operation: operation, retryCounter: $0)
            }
        }
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
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadedFileIdentifiers {
        let operation = try await uploadNewRevisionOperation(
            currentActiveRevisionUid: currentActiveRevisionUid,
            fileURL: fileURL,
            fileSize: fileSize,
            modificationDate: modificationDate,
            thumbnails: thumbnails,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
        
        return try await awaitUploadCompletion(operation: operation, retryCounter: 0)
    }
    
    public func uploadNewRevisionOperation(
        currentActiveRevisionUid: SDKRevisionUid,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        thumbnails: [ThumbnailData],
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadOperation {
        return try await uploadsManager.uploadNewRevisionOperation(
            currentActiveRevisionUid: currentActiveRevisionUid,
            fileURL: fileURL,
            fileSize: fileSize,
            modificationDate: modificationDate,
            thumbnails: thumbnails,
            cancellationToken: cancellationToken,
            progressCallback: progressCallback
        )
    }
    
    public func cancelUpload(cancellationToken: UUID) async throws {
        try await uploadsManager.cancelUpload(with: cancellationToken)
    }

    public func getAvailableName(
        parentFolderUid: SDKNodeUid,
        name: String
    ) async throws -> String {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        defer {
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

    static func unbox(callbackPointer: Int, releaseBox: () -> Void, weakDriveClient: WeakReference<ProtonDriveClient>) -> ProtonDriveClient? {
        guard let driveClient = weakDriveClient.value else {
            releaseBox()
            let message = "account client callback called after the proton client object was deallocated"
            SDKResponseHandler.sendInteropErrorToSDK(message: message, callbackPointer: callbackPointer)
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
    
    private static func freeProtonDriveClient(_ clientHandle: Int64, _ logger: Logger?) {
        Task {
            let freeRequest = Proton_Drive_Sdk_DriveClientFreeRequest.with {
                $0.clientHandle = clientHandle
            }
            do {
                try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
            } catch {
                // If the request to free the client failed, we have a memory leak, but not much else can be done.
                logger?.error("Proton_Drive_Sdk_DriveClientFreeRequest failed: \(error)", category: "ProtonDriveClient.freeProtonDriveClient")
            }
        }
    }
}
