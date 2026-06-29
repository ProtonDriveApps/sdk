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

/// Extended attribute for photo upload
public struct AdditionalMetadata: Sendable {
    public let name: String
    public let utf8JsonValue: Data

    var toSDK: Proton_Drive_Sdk_AdditionalMetadataProperty {
        Proton_Drive_Sdk_AdditionalMetadataProperty.with {
            $0.name = name
            $0.utf8JsonValue = utf8JsonValue
        }
    }

    public init(name: String, utf8JsonValue: Data) {
        self.name = name
        self.utf8JsonValue = utf8JsonValue
    }

    init(result: Proton_Drive_Sdk_AdditionalMetadataProperty) {
        self.name = result.name
        self.utf8JsonValue = result.utf8JsonValue
    }
}

private struct StringResultParser {
    func parse(_ result: Proton_Drive_Sdk_StringResult) -> Result<String, ProtonDriveSDKDriveError> {
        switch result.result {
        case .value(let string):
            return .success(string)
        case .error(let error):
            return .failure(.init(error: error))
        case .none:
            assertionFailure("Unexpected case")
            return .failure(.init(message: "no value or error set"))
        }
    }
}

public struct FolderNode: Sendable {
    public let uid: SDKNodeUid
    public let parentUid: SDKNodeUid?
    public let name: Result<String, ProtonDriveSDKDriveError>
    /// Created on server
    public let creationTime: TimeInterval
    /// When the node was moved to trash
    public let trashTime: TimeInterval?
    /// Person who named the file
    public let nameAuthor: Author
    public let author: Author
    /// Owner of the node, either email or organization
    public let ownedBy: OwnedBy
    public let errors: [ProtonDriveSDKDriveError]

    public init(uid: SDKNodeUid,
                parentUid: SDKNodeUid?,
                name: Result<String, ProtonDriveSDKDriveError>,
                creationTime: TimeInterval,
                trashTime: TimeInterval?,
                nameAuthor: Author,
                author: Author,
                ownedBy: OwnedBy,
                errors: [ProtonDriveSDKDriveError])
    {
        self.uid = uid
        self.parentUid = parentUid
        self.name = name
        self.creationTime = creationTime
        self.trashTime = trashTime
        self.nameAuthor = nameAuthor
        self.author = author
        self.ownedBy = ownedBy
        self.errors = errors
    }

    init(sdkFolderNode: Proton_Drive_Sdk_FolderNode) throws {
        guard let uid = SDKNodeUid(sdkCompatibleIdentifier: sdkFolderNode.uid) else {
            throw ProtonDriveSDKError(interopError: .incorrectIDFormat(id: sdkFolderNode.uid))
        }
        self.uid = uid
        self.parentUid = sdkFolderNode.hasParentUid ? .init(sdkCompatibleIdentifier: sdkFolderNode.parentUid) : nil
        self.name = StringResultParser().parse(sdkFolderNode.name)
        self.creationTime = sdkFolderNode.creationTime.timeIntervalSince1970
        self.trashTime = sdkFolderNode.hasTrashTime ? sdkFolderNode.trashTime.timeIntervalSince1970 : nil
        self.nameAuthor = Author(result: sdkFolderNode.nameAuthor)
        self.author = Author(result: sdkFolderNode.author)
        self.ownedBy = OwnedBy(result: sdkFolderNode.ownedBy)
        self.errors = sdkFolderNode.errors.map { ProtonDriveSDKDriveError(error: $0) }
    }
}

// FIXME: Preserve distinction between verified and claimed email addresses to match original interface.
public struct Author: Sendable {
    public let emailAddress: String?
    public let signatureVerificationError: String?

    public init(emailAddress: String?, signatureVerificationError: String?) {
        self.emailAddress = emailAddress
        self.signatureVerificationError = signatureVerificationError
    }

    init(result: Proton_Drive_Sdk_AuthorResult) {
        switch result.result {
        case .value(let author):
            self.emailAddress = author.emailAddress
            self.signatureVerificationError = nil
        case .error(let error):
            self.emailAddress = error.claimedAuthor.emailAddress
            self.signatureVerificationError = error.message
        case .none:
            self.emailAddress = nil
            self.signatureVerificationError = "Invalid AuthorResult: no value or error set"
        }
    }
}

/// Owner of the node (who owns the volume where the node is located).
public struct OwnedBy: Sendable {
    /// Email of the owner for regular and photo volumes, nil otherwise
    public let email: String?
    /// Organization name for org. volumes, nil otherwise
    public let organization: String?

    init(result: Proton_Drive_Sdk_OwnedBy) {
        self.email = result.hasEmail ? result.email : nil
        self.organization = result.hasOrganization ? result.organization : nil
    }

    public init(email: String?, organization: String?) {
        self.email = email
        self.organization = organization
    }
}

public struct FileNode: Sendable {
    public let uid: SDKNodeUid
    public let parentUid: SDKNodeUid?
    public let name: Result<String, ProtonDriveSDKDriveError>
    public let creationTime: TimeInterval
    public let trashTime: TimeInterval?
    /// Person who named the file
    public let nameAuthor: Author
    public let author: Author
    /// Owner of the node, either email or organization
    public let ownedBy: OwnedBy
    /// MIME type of the file
    public let mediaType: String
    /// Total size of all revisions, encrypted size on the server
    public let totalSizeOnCloudStorage: Int64
    public let activeRevision: FileRevision
    public let errors: [ProtonDriveSDKDriveError]

    public init(uid: SDKNodeUid,
                parentUid: SDKNodeUid,
                name: Result<String, ProtonDriveSDKDriveError>,
                creationTime: TimeInterval,
                trashTime: TimeInterval?,
                nameAuthor: Author,
                author: Author,
                ownedBy: OwnedBy,
                mediaType: String,
                totalSizeOnCloudStorage: Int64,
                activeRevision: FileRevision,
                errors: [ProtonDriveSDKDriveError]) {
        self.uid = uid
        self.parentUid = parentUid
        self.name = name
        self.creationTime = creationTime
        self.trashTime = trashTime
        self.nameAuthor = nameAuthor
        self.author = author
        self.ownedBy = ownedBy
        self.mediaType = mediaType
        self.totalSizeOnCloudStorage = totalSizeOnCloudStorage
        self.activeRevision = activeRevision
        self.errors = errors
    }

    init(sdkFileNode: Proton_Drive_Sdk_FileNode) throws {
        guard let uid = SDKNodeUid(sdkCompatibleIdentifier: sdkFileNode.uid) else {
            throw ProtonDriveSDKError(interopError: .incorrectIDFormat(id: sdkFileNode.uid))
        }
        self.uid = uid
        self.parentUid = sdkFileNode.hasParentUid ? .init(sdkCompatibleIdentifier: sdkFileNode.parentUid) : nil
        self.name = StringResultParser().parse(sdkFileNode.name)
        self.creationTime = sdkFileNode.creationTime.timeIntervalSince1970
        self.trashTime = sdkFileNode.trashTime.timeIntervalSince1970
        self.nameAuthor = Author(result: sdkFileNode.nameAuthor)
        self.author = Author(result: sdkFileNode.author)
        self.ownedBy = OwnedBy(result: sdkFileNode.ownedBy)
        self.mediaType = sdkFileNode.mediaType
        self.totalSizeOnCloudStorage = sdkFileNode.totalSizeOnCloudStorage
        self.activeRevision = try FileRevision(sdkFileRevision: sdkFileNode.activeRevision)
        self.errors = sdkFileNode.errors.map { ProtonDriveSDKDriveError(error: $0) }
    }
}

public struct FileContentDigests: Sendable {
    /// SHA1 digest of the file content
    public let sha1: Data?
    /// Whether the SHA1 digest was verified against the expected one passed by the client during upload
    public let sha1Verified: Bool

    init(result: Proton_Drive_Sdk_FileContentDigests) {
        self.sha1 = result.hasSha1 ? result.sha1 : nil
        self.sha1Verified = result.sha1Verified
    }

    public init(sha1: Data?, sha1Verified: Bool) {
        self.sha1 = sha1
        self.sha1Verified = sha1Verified
    }
}

public struct ThumbnailHeader: Sendable {
    public enum `Type`: Int, Sendable {
        case thumbnail = 1
        case preview = 2
        case unknown = -1
    }

    public let id: String
    public let type: Type

    public init(id: String, type: Int) {
        self.id = id
        self.type = Type(rawValue: type) ?? .unknown
    }

    init(result: Proton_Drive_Sdk_ThumbnailHeader) {
        self.id = result.id
        self.type = Type(rawValue: result.type.rawValue) ?? .unknown
    }
}

public struct FileRevision: Sendable {
    public let uid: SDKRevisionUid
    /// When the revision was created on the server
    public let creationTime: Double
    /// Encrypted size
    public let sizeOnCloudStorage: Int64
    /// Raw size of the revision as stored in extended attributes
    public let claimedSize: Int64?
    /// Claimed file digests for integrity verification
    public let claimedDigests: FileContentDigests
    /// Claimed modification time from the file system
    public let claimedModificationTime: Double?
    public let thumbnails: [ThumbnailHeader]
    public let additionalClaimedMetadata: [AdditionalMetadata]?
    public let contentAuthor: Author?

    public init(uid: SDKRevisionUid,
                creationTime: Double,
                sizeOnCloudStorage: Int64,
                claimedSize: Int64?,
                claimedDigests: FileContentDigests,
                claimedModificationTime: Double?,
                thumbnails: [ThumbnailHeader],
                additionalClaimedMetadata: [AdditionalMetadata]?,
                contentAuthor: Author?) {
        self.uid = uid
        self.creationTime = creationTime
        self.sizeOnCloudStorage = sizeOnCloudStorage
        self.claimedSize = claimedSize
        self.claimedDigests = claimedDigests
        self.claimedModificationTime = claimedModificationTime
        self.thumbnails = thumbnails
        self.additionalClaimedMetadata = additionalClaimedMetadata
        self.contentAuthor = contentAuthor
    }

    init(sdkFileRevision: Proton_Drive_Sdk_FileRevision) throws {

        guard let id = SDKRevisionUid(sdkCompatibleIdentifier: sdkFileRevision.uid) else {
            throw ProtonDriveSDKError(interopError: .incorrectIDFormat(id: sdkFileRevision.uid))
        }
        self.uid = id
        self.creationTime = sdkFileRevision.creationTime.timeIntervalSince1970
        self.sizeOnCloudStorage = sdkFileRevision.sizeOnCloudStorage
        self.claimedSize = sdkFileRevision.hasClaimedSize ? sdkFileRevision.claimedSize : nil
        self.claimedDigests = FileContentDigests(result: sdkFileRevision.claimedDigests)
        self.claimedModificationTime = sdkFileRevision.hasClaimedModificationTime
        ? sdkFileRevision.claimedModificationTime.timeIntervalSince1970
        : nil
        self.thumbnails = sdkFileRevision.thumbnails.map { ThumbnailHeader(result: $0) }
        self.additionalClaimedMetadata = sdkFileRevision.additionalClaimedMetadata.map { AdditionalMetadata(result: $0) }
        self.contentAuthor = sdkFileRevision.hasContentAuthor ? Author(result: sdkFileRevision.contentAuthor) : nil
    }
}

public enum DriveNode: Sendable {
    case folder(FolderNode)
    case file(FileNode)

    init(sdkNode: Proton_Drive_Sdk_Node) throws {
        switch sdkNode.node {
        case .folder(let folder):
            self = .folder(try FolderNode(sdkFolderNode: folder))
        case .file(let file):
            self = .file(try FileNode(sdkFileNode: file))
        case .none:
            throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Invalid Node: no folder or file set"))
        }
    }

    public init(fileNode: FileNode) {
        self = .file(fileNode)
    }

    public init(folderNode: FolderNode) {
        self = .folder(folderNode)
    }
}

public struct UploadedFileIdentifiers: Sendable {
    public let nodeUid: SDKNodeUid
    public let revisionUid: SDKRevisionUid

    public init(nodeUid: SDKNodeUid, revisionUid: SDKRevisionUid) {
        self.nodeUid = nodeUid
        self.revisionUid = revisionUid
    }

    init?(interopUploadResult: Proton_Drive_Sdk_UploadResult) {
        guard let nodeUid = SDKNodeUid(sdkCompatibleIdentifier: interopUploadResult.nodeUid),
              let revisionUid = SDKRevisionUid(sdkCompatibleIdentifier: interopUploadResult.revisionUid)
        else { return nil }
        self.nodeUid = nodeUid
        self.revisionUid = revisionUid
    }
}

public struct PhotoTimelineItem: Sendable {
    public let nodeUid: SDKNodeUid
    public let captureTime: Double

    public init(nodeUid: SDKNodeUid, captureTime: Double) {
        self.nodeUid = nodeUid
        self.captureTime = captureTime
    }

    init?(item: Proton_Drive_Sdk_PhotosTimelineItem) {
        guard let nodeUid = SDKNodeUid(sdkCompatibleIdentifier: item.nodeUid) else { return nil }
        self.nodeUid = nodeUid
        self.captureTime = item.captureTime.timeIntervalSince1970
    }
}

public struct SDKDeviceUid: Sendable {
    public let deviceID: String
    public let sdkCompatibleIdentifier: String

    public init(deviceID: String) {
        self.deviceID = deviceID
        self.sdkCompatibleIdentifier = deviceID
    }

    public init?(sdkCompatibleIdentifier: String) {
        guard !sdkCompatibleIdentifier.isEmpty else { return nil }
        self.deviceID = sdkCompatibleIdentifier
        self.sdkCompatibleIdentifier = sdkCompatibleIdentifier
    }
}

/// Platform of a device registered in Proton Drive.
public enum DeviceType: Sendable {
    case windows
    case macOS
    case linux

    var sdkType: Proton_Drive_Sdk_DeviceType {
        switch self {
        case .windows: return .windows
        case .macOS: return .macos
        case .linux: return .linux
        }
    }

    init(sdkType: Proton_Drive_Sdk_DeviceType) throws {
        switch sdkType {
        case .windows: self = .windows
        case .macos: self = .macOS
        case .linux: self = .linux
        case .unspecified, .UNRECOGNIZED:
            throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Unknown device type: \(sdkType)"))
        }
    }
}

public struct Device: Sendable {
    public let uid: SDKDeviceUid
    public let type: DeviceType
    /// Device name, which may fail to decrypt or have invalid characters.
    public let name: Result<String, ProtonDriveSDKDriveError>
    /// Identifier of the device's root folder.
    public let rootFolderUid: SDKNodeUid
    /// When the device was created on the server.
    public let creationTime: TimeInterval
    /// Last time the device synchronised data, if ever.
    public let lastSyncTime: TimeInterval?
    /// Identifier of the device's share.
    /// To be removed once Volume-based navigation is implemented.
    public let shareID: String

    public init(uid: SDKDeviceUid,
                type: DeviceType,
                name: Result<String, ProtonDriveSDKDriveError>,
                rootFolderUid: SDKNodeUid,
                creationTime: TimeInterval,
                lastSyncTime: TimeInterval?,
                shareID: String) {
        self.uid = uid
        self.type = type
        self.name = name
        self.rootFolderUid = rootFolderUid
        self.creationTime = creationTime
        self.lastSyncTime = lastSyncTime
        self.shareID = shareID
    }

    init(sdkDevice: Proton_Drive_Sdk_Device) throws {
        guard let uid = SDKDeviceUid(sdkCompatibleIdentifier: sdkDevice.uid) else {
            throw ProtonDriveSDKError(interopError: .incorrectIDFormat(id: sdkDevice.uid))
        }
        guard let rootFolderUid = SDKNodeUid(sdkCompatibleIdentifier: sdkDevice.rootFolderUid) else {
            throw ProtonDriveSDKError(interopError: .incorrectIDFormat(id: sdkDevice.rootFolderUid))
        }
        self.uid = uid
        self.type = try DeviceType(sdkType: sdkDevice.type)
        self.name = StringResultParser().parse(sdkDevice.name)
        self.rootFolderUid = rootFolderUid
        self.creationTime = sdkDevice.creationTime.timeIntervalSince1970
        self.lastSyncTime = sdkDevice.hasLastSyncTime ? sdkDevice.lastSyncTime.timeIntervalSince1970 : nil
        self.shareID = sdkDevice.shareID
    }
}

public struct TrashNodeResult: Sendable {
    public let nodeUid: SDKNodeUid
    public let error: ProtonDriveSDKError?

    public init(nodeUid: SDKNodeUid, error: ProtonDriveSDKError?) {
        self.nodeUid = nodeUid
        self.error = error
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

/// Callback for thumbnail updates
public typealias ThumbnailCallback = @Sendable (Result<ThumbnailDataWithId?, Error>) -> Void

/// Thumbnail with file id
public struct ThumbnailDataWithId: Sendable {
    public let fileUid: SDKNodeUid
    public let result: Result<Data, ProtonDriveSDKDriveError>

    public init(fileUid: SDKNodeUid,
                result: Result<Data, ProtonDriveSDKDriveError>) {
        self.fileUid = fileUid
        self.result = result
    }

    init?(fileThumbnail: Proton_Drive_Sdk_FileThumbnail) {
        guard let fileUid = SDKNodeUid(sdkCompatibleIdentifier: fileThumbnail.fileUid) else {
            return nil
        }
        self.fileUid = fileUid
        switch fileThumbnail.result {
        case .data(let data):
            self.result = .success(data)
        case .error(let error):
            self.result = .failure(ProtonDriveSDKDriveError(error: error))
        case .none:
            assert(false, "Unexpected case")
            return nil
        }
    }

    #if DEBUG
    // Only for test
    public init?(uid: SDKNodeUid, successData: Data?, errorMessage: String?) {
        self.fileUid = uid
        if let successData {
            self.result = .success(successData)
        } else if let errorMessage {
            self.result = .failure(.init(message: errorMessage))
        } else {
            return nil
        }
    }
    #endif
}
