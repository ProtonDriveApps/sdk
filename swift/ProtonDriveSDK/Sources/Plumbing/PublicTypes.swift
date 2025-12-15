import Foundation

// MARK: - Swift Types (hiding protobuf implementation)

public struct SDKNodeUid: Sendable {
    public let volumeID: String
    public let nodeID: String
    public let sdkCompatibleIdentifier: String
    
    public init(volumeID: String, nodeID: String) {
        self.volumeID = volumeID
        self.nodeID = nodeID
        self.sdkCompatibleIdentifier = "\(volumeID)~\(nodeID)"
    }
    
    public init?(sdkCompatibleIdentifier: String) {
        guard let match = sdkCompatibleIdentifier.firstMatch(of: #/(.+)~(.+)/#) else { return nil }
        self.volumeID = String(match.output.1)
        self.nodeID = String(match.output.2)
        self.sdkCompatibleIdentifier = sdkCompatibleIdentifier
    }
}

public struct SDKRevisionUid: Sendable {
    public let volumeID: String
    public let nodeID: String
    public let revisionID: String
    public let sdkCompatibleIdentifier: String
    
    public init(sdkNodeUid: SDKNodeUid, revisionID: String) {
        self.init(volumeID: sdkNodeUid.volumeID, nodeID: sdkNodeUid.nodeID, revisionID: revisionID)
    }
    
    public init(volumeID: String, nodeID: String, revisionID: String) {
        self.volumeID = volumeID
        self.nodeID = nodeID
        self.revisionID = revisionID
        self.sdkCompatibleIdentifier = "\(volumeID)~\(nodeID)~\(revisionID)"
    }
    
    public init?(sdkCompatibleIdentifier: String) {
        guard let match = sdkCompatibleIdentifier.firstMatch(of: #/(.+)~(.+)~(.+)/#) else { return nil }
        self.volumeID = String(match.output.1)
        self.nodeID = String(match.output.2)
        self.revisionID = String(match.output.3)
        self.sdkCompatibleIdentifier = sdkCompatibleIdentifier
    }
}

/// TLS policy for Proton client connections
public enum TlsPolicy: Sendable {
    case strict
    case noCertificatePinning
    case noCertificateValidation
}

/// Session tokens for authentication
public struct SessionTokens {
    public let accessToken: String
    public let refreshToken: String

    public init(accessToken: String, refreshToken: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
    }
}

/// Proton client configuration options
public struct ClientOptions: Sendable {
    public let baseUrl: String?
    public let userAgent: String?
    public let bindingsLanguage: String?
    public let tlsPolicy: TlsPolicy?
    public let loggerProviderHandle: Int?
    public let entityCachePath: String?
    public let secretCachePath: String?

    public init(baseUrl: String? = nil,
                userAgent: String? = nil,
                bindingsLanguage: String? = nil,
                tlsPolicy: TlsPolicy? = nil,
                loggerProviderHandle: Int? = nil,
                entityCachePath: String? = nil,
                secretCachePath: String? = nil
    ) {
        self.baseUrl = baseUrl
        self.userAgent = userAgent
        self.bindingsLanguage = bindingsLanguage
        self.tlsPolicy = tlsPolicy
        self.loggerProviderHandle = loggerProviderHandle
        self.entityCachePath = entityCachePath
        self.secretCachePath = secretCachePath
    }
}

/// Thumbnail data for file uploads
public struct ThumbnailData: Sendable {
    public enum ThumbnailType: Sendable {
        case thumbnail
        case preview
    }

    public let type: ThumbnailType
    public let data: Data

    public init(type: ThumbnailType, data: Data) {
        self.type = type
        self.data = data
    }
}

public struct FileNode: Sendable {
    let uid: String
    let parentUid: String
    let name: String
    let mediaType: String
    let totalSizeOnCloudStorage: Int64
    let activeRevision: FileRevision

    init(sdkFileNode: Proton_Drive_Sdk_FileNode) {
        self.uid = sdkFileNode.uid
        self.parentUid = sdkFileNode.parentUid
        self.name = sdkFileNode.name
        self.mediaType = sdkFileNode.mediaType
        self.totalSizeOnCloudStorage = sdkFileNode.totalSizeOnCloudStorage
        self.activeRevision = FileRevision(sdkFileRevision: sdkFileNode.activeRevision)
    }
}

public struct FileRevision: Sendable {
    let uid: String
    let creationTime: Double
    let sizeOnCloudStorage: Int64
    let claimedSize: Int64?
    let claimedModificationTime: Double?

    init(sdkFileRevision: Proton_Drive_Sdk_FileRevision) {
        self.uid = sdkFileRevision.uid
        self.creationTime = sdkFileRevision.creationTime.timeIntervalSince1970
        self.sizeOnCloudStorage = sdkFileRevision.sizeOnCloudStorage
        self.claimedSize = sdkFileRevision.claimedSize
        self.claimedModificationTime = sdkFileRevision.claimedModificationTime.timeIntervalSince1970
    }
}

public struct UploadedFileIdentifiers: Sendable {
    public let nodeUid: SDKNodeUid
    public let revisionUid: SDKRevisionUid
    
    init?(interopUploadResult: Proton_Drive_Sdk_UploadResult) {
        guard let nodeUid = SDKNodeUid(sdkCompatibleIdentifier: interopUploadResult.nodeUid),
              let revisionUid = SDKRevisionUid(sdkCompatibleIdentifier: interopUploadResult.revisionUid)
        else { return nil }
        self.nodeUid = nodeUid
        self.revisionUid = revisionUid
    }
}

/// Callback for progress updates
public typealias ProgressCallback = @Sendable (FileOperationProgress) -> Void

/// Progress information for upload/download operations
public struct FileOperationProgress {
    public let bytesCompleted: Int64?
    public let bytesTotal: Int64?

    /// Progress percentage (0.0 to 1.0)
    public var fractionCompleted: Double {
        guard let bytesTotal, let bytesCompleted else { return 0.0 }
        guard bytesTotal > 0 else { return 0.0 }
        let value = Double(bytesCompleted) / Double(bytesTotal)
        return min(1.0, value)
    }

    public var isCompleted: Bool { fractionCompleted == 1.0 }

    public init(bytesCompleted: Int64?, bytesTotal: Int64?) {
        self.bytesCompleted = bytesCompleted
        self.bytesTotal = bytesTotal
    }
}

/// Thumbnail with file id
public struct ThumbnailDataWithId: Sendable {
    public let fileUid: SDKNodeUid
    public let data: Data

    init?(fileThumbnail: Proton_Drive_Sdk_FileThumbnail) {
        guard let fileUid = SDKNodeUid(sdkCompatibleIdentifier: fileThumbnail.fileUid) else {
            return nil
        }
        self.fileUid = fileUid
        self.data = fileThumbnail.data
    }
}
