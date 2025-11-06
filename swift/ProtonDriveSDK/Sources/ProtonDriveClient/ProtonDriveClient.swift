import Foundation

/// Main entry point for all SDK functionality.
///
/// Create a single object of this class and use it to perform downloads, uploads and all other supported operations.
public actor ProtonDriveClient: Sendable {

    private var clientHandle: ObjectHandle!
    
    private var uploadManager: UploadManager!
    private var downloadManager: DownloadManager!
    
    private let logger: ProtonDriveSDK.Logger

    let httpClient: HttpClientProtocol
    let accountClient: AccountClientProtocol

    public init(
        baseURL: String,
        entityCachePath: String? = nil,
        secretCachePath: String? = nil,
        httpClient: HttpClientProtocol,
        accountClient: AccountClientProtocol,
        logCallback: @escaping LogCallback
    ) async throws {
        self.logger = try await Logger(logCallback: logCallback)

        self.httpClient = httpClient
        self.accountClient = accountClient

        let clientCreateRequest = Proton_Drive_Sdk_DriveClientCreateRequest.with {
            $0.baseURL = baseURL

            $0.httpClientRequestAction = Int64(ObjectHandle(callback: cCompatibleHttpRequest))
            $0.accountClientRequestAction = Int64(ObjectHandle(callback: cCompatibleAccountClientRequest))
            $0.logAction = Int64(ObjectHandle(callback: cCompatibleLogCallback))

            if let entityCachePath {
                $0.entityCachePath = entityCachePath
            }
            if let secretCachePath {
                $0.secretCachePath = secretCachePath
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
    }

    nonisolated func log(_ logEvent: LogEvent) {
        logger.logCallback(logEvent)
    }

    public func downloadFile(
        revisionUid: SDKRevisionUid,
        destinationUrl: URL,
        progressCallback: @escaping ProgressCallback
    ) async throws {
        try await downloadManager.downloadFile(
            revisionUid: revisionUid,
            destinationUrl: destinationUrl,
            progressCallback: progressCallback
        )
    }

    public func uploadFile(
        parentFolderUid: SDKNodeUid,
        name: String,
        url: URL,
        fileSize: Int64,
        modificationDate: Date,
        mediaType: String,
        thumbnails: [ThumbnailData],
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
            progressCallback: progressCallback
        )
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
}
