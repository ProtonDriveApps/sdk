import Foundation

public typealias RecordMetricEventCallback = @Sendable (MetricEvent) -> Void

public enum MetricEvent: Sendable {
    
    case apiRetrySucceeded(ApiRetrySucceededEventPayload)
    case blockVerificationError(BlockVerificationErrorEventPayload)
    case decryptionError(DecryptionErrorEventPayload)
    case download(DownloadEventPayload)
    case upload(UploadEventPayload)
    case verificationError(VerificationErrorEventPayload)
    
    case other(name: String)
    
    init(sdkMetricEvent: Proton_Sdk_MetricEvent) throws {
        switch sdkMetricEvent.payload {
        case let proto where proto.isA(Proton_Sdk_ApiRetrySucceededEventPayload.self):
            let sdkPayload = try Proton_Sdk_ApiRetrySucceededEventPayload(unpackingAny: proto)
            self = .apiRetrySucceeded(ApiRetrySucceededEventPayload(sdkEventPayload: sdkPayload))
        
        case let proto where proto.isA(Proton_Drive_Sdk_BlockVerificationErrorEventPayload.self):
            let sdkPayload = try Proton_Drive_Sdk_BlockVerificationErrorEventPayload(unpackingAny: proto)
            self = .blockVerificationError(BlockVerificationErrorEventPayload(sdkEventPayload: sdkPayload))
        
        case let proto where proto.isA(Proton_Drive_Sdk_DecryptionErrorEventPayload.self):
            let sdkPayload = try Proton_Drive_Sdk_DecryptionErrorEventPayload(unpackingAny: proto)
            self = .decryptionError(DecryptionErrorEventPayload(sdkEventPayload: sdkPayload))
        
        case let proto where proto.isA(Proton_Drive_Sdk_DownloadEventPayload.self):
            let sdkPayload = try Proton_Drive_Sdk_DownloadEventPayload(unpackingAny: proto)
            self = .download(DownloadEventPayload(sdkDownloadEventPayload: sdkPayload))
        
        case let proto where proto.isA(Proton_Drive_Sdk_UploadEventPayload.self):
            let sdkPayload = try Proton_Drive_Sdk_UploadEventPayload(unpackingAny: proto)
            self = .upload(UploadEventPayload(sdkUploadEventPayload: sdkPayload))
        
        case let proto where proto.isA(Proton_Drive_Sdk_VerificationErrorEventPayload.self):
            let sdkPayload = try Proton_Drive_Sdk_VerificationErrorEventPayload(unpackingAny: proto)
            self = .verificationError(VerificationErrorEventPayload(sdkEventPayload: sdkPayload))
        
        default:
            self = .other(name: sdkMetricEvent.name)
        }
    }
}

public struct ApiRetrySucceededEventPayload: Sendable {

    public let url: String
    public let failedAttempts: Int
    
    init(sdkEventPayload: Proton_Sdk_ApiRetrySucceededEventPayload) {
        self.url = sdkEventPayload.url
        self.failedAttempts = Int(sdkEventPayload.failedAttempts)
    }
}

public struct BlockVerificationErrorEventPayload: Sendable {
    
    public let retryHelped: Bool
    
    init(sdkEventPayload: Proton_Drive_Sdk_BlockVerificationErrorEventPayload) {
        self.retryHelped = sdkEventPayload.retryHelped
    }
}

public struct DecryptionErrorEventPayload: Sendable {
    
    public let volumeType: VolumeType
    public let field: EncryptedField
    public let fromBefore2024: Bool
    public let error: String?
    public let uid: String
    
    init(sdkEventPayload: Proton_Drive_Sdk_DecryptionErrorEventPayload) {
        self.volumeType = .init(sdkVolumeType: sdkEventPayload.volumeType)
        self.field = .init(sdkEncryptedField: sdkEventPayload.field)
        self.fromBefore2024 = sdkEventPayload.fromBefore2024
        self.error = sdkEventPayload.hasError ? sdkEventPayload.error : nil
        self.uid = sdkEventPayload.uid
    }
}

public struct DownloadEventPayload: Sendable {
    
    public let volumeType: VolumeType
    public let expectedSize: Int64
    public let downloadedSize: Int64
    public let error: DownloadError?
    public let originalError: String?
    
    init(sdkDownloadEventPayload: Proton_Drive_Sdk_DownloadEventPayload) {
        self.volumeType = .init(sdkVolumeType: sdkDownloadEventPayload.volumeType)
        self.expectedSize = sdkDownloadEventPayload.expectedSize
        self.downloadedSize = sdkDownloadEventPayload.uploadedSize
        self.error = sdkDownloadEventPayload.hasError ? .init(sdkDownloadError: sdkDownloadEventPayload.error) : nil
        self.originalError = sdkDownloadEventPayload.hasOriginalError ? sdkDownloadEventPayload.originalError : nil
    }
}

public struct UploadEventPayload: Sendable {
    
    public let volumeType: VolumeType
    public let expectedSize: Int64
    public let uploadedSize: Int64
    public let error: UploadError?
    public let originalError: String?
    
    init(sdkUploadEventPayload: Proton_Drive_Sdk_UploadEventPayload) {
        self.volumeType = .init(sdkVolumeType: sdkUploadEventPayload.volumeType)
        self.expectedSize = sdkUploadEventPayload.expectedSize
        self.uploadedSize = sdkUploadEventPayload.uploadedSize
        self.error = sdkUploadEventPayload.hasError ? .init(sdkUploadError: sdkUploadEventPayload.error) : nil
        self.originalError = sdkUploadEventPayload.hasOriginalError ? sdkUploadEventPayload.originalError : nil
    }
}

public struct VerificationErrorEventPayload: Sendable {
    
    public let volumeType: VolumeType
    public let field: EncryptedField
    public let fromBefore2024: Bool
    public let addressMatchingDefaultShare: Bool
    public let error: String?
    public let uid: String
    
    init(sdkEventPayload: Proton_Drive_Sdk_VerificationErrorEventPayload) {
        self.volumeType = .init(sdkVolumeType: sdkEventPayload.volumeType)
        self.field = .init(sdkEncryptedField: sdkEventPayload.field)
        self.fromBefore2024 = sdkEventPayload.fromBefore2024
        self.addressMatchingDefaultShare = sdkEventPayload.addressMatchingDefaultShare
        self.error = sdkEventPayload.hasError ? sdkEventPayload.error : nil
        self.uid = sdkEventPayload.uid
    }
}


public enum VolumeType: Int, Sendable {
    case unknown = -1
    case ownVolume = 0
    case shared = 1
    case sharedPublic = 2
    case photo = 3
    
    init(sdkVolumeType: Proton_Drive_Sdk_VolumeType) {
        switch sdkVolumeType {
        case .ownVolume:
            self = .ownVolume
        case .shared:
            self = .shared
        case .sharedPublic:
            self = .sharedPublic
        case .photo:
            self = .photo
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized VolumeType from the SDK \(value)")
            self = .unknown
        }
    }
}

public enum EncryptedField: Int, Sendable {
    case unknown = -1
    case shareKey = 0
    case nodeKey = 1
    case nodeName = 2
    case nodeHashKey = 3
    case nodeExtendedAttributes = 4
    case nodeContentKey = 5
    case content = 6
    
    init(sdkEncryptedField: Proton_Drive_Sdk_EncryptedField) {
        switch sdkEncryptedField {
        case .shareKey:
            self = .shareKey
        case .nodeKey:
            self = .nodeKey
        case .nodeName:
            self = .nodeName
        case .nodeHashKey:
            self = .nodeHashKey
        case .nodeExtendedAttributes:
            self = .nodeExtendedAttributes
        case .nodeContentKey:
            self = .nodeContentKey
        case .content:
            self = .content
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized EncryptedField from the SDK \(value)")
            self = .unknown
        }
    }
}

public enum DownloadError: Int, Sendable {
    case serverError = 0
    case networkError = 1
    case decryptionError = 2
    case integrityError = 3
    case rateLimited = 4
    case httpClientSideError = 5
    case unknown = 6
    
    init(sdkDownloadError: Proton_Drive_Sdk_DownloadError) {
        switch sdkDownloadError {
        case .serverError:
            self = .serverError
        case .networkError:
            self = .networkError
        case .decryptionError:
            self = .decryptionError
        case .integrityError:
            self = .integrityError
        case .rateLimited:
            self = .rateLimited
        case .httpClientSideError:
            self = .httpClientSideError
        case .unknown:
            self = .unknown
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized DownloadError from the SDK \(value)")
            self = .unknown
        }
    }
}

public enum UploadError: Int, Sendable {
    case serverError = 0
    case networkError = 1
    case integrityError = 2
    case rateLimited = 3
    case httpClientSideError = 4
    case unknown = 5
    
    init(sdkUploadError: Proton_Drive_Sdk_UploadError) {
        switch sdkUploadError {
        case .serverError:
            self = .serverError
        case .networkError:
            self = .networkError
        case .integrityError:
            self = .integrityError
        case .rateLimited:
            self = .rateLimited
        case .httpClientSideError:
            self = .httpClientSideError
        case .unknown:
            self = .unknown
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized UploadError from the SDK \(value)")
            self = .unknown
        }
    }
}
