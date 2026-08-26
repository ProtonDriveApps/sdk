import Foundation

public typealias RecordMetricEventCallback = @Sendable (MetricEvent) -> Void

public enum MetricEvent: Sendable {

    case apiRetrySucceeded(ApiRetrySucceededEventPayload)
    case blockVerificationError(BlockVerificationErrorEventPayload)
    case decryptionError(DecryptionErrorEventPayload)
    case download(DownloadEventPayload)
    case upload(UploadEventPayload)
    case uploadPerformance(UploadPerformanceEventPayload)
    case verificationError(VerificationErrorEventPayload)

    case other(name: String)

    init(sdkMetricEvent: Proton_Drive_Sdk_MetricEvent) throws {
        switch sdkMetricEvent.payload {
        case let proto where proto.isA(Proton_Drive_Sdk_ApiRetrySucceededEventPayload.self):
            let sdkPayload = try Proton_Drive_Sdk_ApiRetrySucceededEventPayload(unpackingAny: proto)
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

        case let proto where proto.isA(Proton_Drive_Sdk_UploadPerformanceEventPayload.self):
            let sdkPayload = try Proton_Drive_Sdk_UploadPerformanceEventPayload(unpackingAny: proto)
            self = .uploadPerformance(UploadPerformanceEventPayload(sdkEventPayload: sdkPayload))

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

    init(sdkEventPayload: Proton_Drive_Sdk_ApiRetrySucceededEventPayload) {
        self.url = sdkEventPayload.url
        self.failedAttempts = Int(sdkEventPayload.failedAttempts)
    }
}

/// One histogram observation of per-file upload performance. The SDK derives `value`, so clients only map
/// `metric` to its registered metric name and turn the one of `uploadRoute`, `sizeClass` and `blockCount` that
/// metric is registered with into its label.
public struct UploadPerformanceEventPayload: Sendable {

    public let metric: UploadPerformanceMetric

    /// Already expressed in the unit of the metric's registered buckets: whole percent for shares,
    /// kibibytes per second for throughput.
    public let value: Int

    public let uploadRoute: UploadRoute
    public let sizeClass: UploadSizeClass
    public let blockCount: UploadBlockCount

    init(
        metric: UploadPerformanceMetric,
        value: Int,
        uploadRoute: UploadRoute,
        sizeClass: UploadSizeClass,
        blockCount: UploadBlockCount
    ) {
        self.metric = metric
        self.value = value
        self.uploadRoute = uploadRoute
        self.sizeClass = sizeClass
        self.blockCount = blockCount
    }

    init(sdkEventPayload: Proton_Drive_Sdk_UploadPerformanceEventPayload) {
        self.metric = .init(sdkUploadPerformanceMetric: sdkEventPayload.metric)
        self.value = Int(sdkEventPayload.value)
        self.uploadRoute = .init(sdkUploadRoute: sdkEventPayload.uploadRoute)
        self.sizeClass = .init(sdkUploadSizeClass: sdkEventPayload.sizeClass)
        self.blockCount = .init(sdkUploadBlockCount: sdkEventPayload.blockCount)
    }
}

public enum UploadPerformanceMetric: Int, Sendable {
    case unrecognized = -1
    case unspecified = 0
    case smallFileThroughput = 1
    case largeFileThroughput = 2
    case largeRouteActiveTimeShare = 3
    case smallRouteActiveTimeShare = 4

    init(sdkUploadPerformanceMetric: Proton_Drive_Sdk_UploadPerformanceMetric) {
        switch sdkUploadPerformanceMetric {
        case .unspecified:
            self = .unspecified
        case .smallFileThroughput:
            self = .smallFileThroughput
        case .largeFileThroughput:
            self = .largeFileThroughput
        case .largeRouteActiveTimeShare:
            self = .largeRouteActiveTimeShare
        case .smallRouteActiveTimeShare:
            self = .smallRouteActiveTimeShare
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized UploadPerformanceMetric from the SDK \(value)")
            self = .unrecognized
        }
    }
}

public enum UploadRoute: Int, Sendable {
    case unrecognized = -1
    case unspecified = 0
    case small = 1
    case block = 2

    init(sdkUploadRoute: Proton_Drive_Sdk_UploadRoute) {
        switch sdkUploadRoute {
        case .unspecified:
            self = .unspecified
        case .small:
            self = .small
        case .block:
            self = .block
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized UploadRoute from the SDK \(value)")
            self = .unrecognized
        }
    }
}

public enum UploadSizeClass: Int, Sendable {
    case unrecognized = -1
    case unspecified = 0
    case small = 1
    case single = 2
    case multi = 3

    init(sdkUploadSizeClass: Proton_Drive_Sdk_UploadSizeClass) {
        switch sdkUploadSizeClass {
        case .unspecified:
            self = .unspecified
        case .small:
            self = .small
        case .single:
            self = .single
        case .multi:
            self = .multi
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized UploadSizeClass from the SDK \(value)")
            self = .unrecognized
        }
    }
}

public enum UploadBlockCount: Int, Sendable {
    case unrecognized = -1
    case unspecified = 0
    case single = 1
    case few = 2
    case many = 3

    init(sdkUploadBlockCount: Proton_Drive_Sdk_UploadBlockCount) {
        switch sdkUploadBlockCount {
        case .unspecified:
            self = .unspecified
        case .single:
            self = .single
        case .few:
            self = .few
        case .many:
            self = .many
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized UploadBlockCount from the SDK \(value)")
            self = .unrecognized
        }
    }
}

public struct BlockVerificationErrorEventPayload: Sendable {

    public let volumeType: VolumeType
    public let retryHelped: Bool

    init(sdkEventPayload: Proton_Drive_Sdk_BlockVerificationErrorEventPayload) {
        self.volumeType = .init(sdkVolumeType: sdkEventPayload.volumeType)
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
    public let approximateClaimedFileSize: Int64
    public let approximateDownloadedSize: Int64
    public let error: DownloadError?
    public let originalError: String?

    init(sdkDownloadEventPayload: Proton_Drive_Sdk_DownloadEventPayload) {
        self.volumeType = .init(sdkVolumeType: sdkDownloadEventPayload.volumeType)
        self.approximateClaimedFileSize = sdkDownloadEventPayload.approximateClaimedFileSize
        self.approximateDownloadedSize = sdkDownloadEventPayload.approximateDownloadedSize
        self.error = sdkDownloadEventPayload.hasError ? .init(sdkDownloadError: sdkDownloadEventPayload.error) : nil
        self.originalError = sdkDownloadEventPayload.hasOriginalError ? sdkDownloadEventPayload.originalError : nil
    }
}

public struct UploadEventPayload: Sendable {

    public let volumeType: VolumeType
    public let approximateExpectedSize: Int64
    public let approximateUploadedSize: Int64
    public let error: UploadError?
    public let originalError: String?

    init(sdkUploadEventPayload: Proton_Drive_Sdk_UploadEventPayload) {
        self.volumeType = .init(sdkVolumeType: sdkUploadEventPayload.volumeType)
        self.approximateExpectedSize = sdkUploadEventPayload.approximateExpectedSize
        self.approximateUploadedSize = sdkUploadEventPayload.approximateUploadedSize
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
    case unrecognized = -1
    case unknown = 0
    case ownVolume = 1
    case ownPhotoVolume = 2
    case shared = 3
    case sharedPublic = 4

    init(sdkVolumeType: Proton_Drive_Sdk_VolumeType) {
        switch sdkVolumeType {
        case .unknown:
            self = .unknown
        case .ownVolume:
            self = .ownVolume
        case .ownPhotoVolume:
            self = .ownPhotoVolume
        case .shared:
            self = .shared
        case .sharedPublic:
            self = .sharedPublic
        case .UNRECOGNIZED(let value):
            assertionFailure("Received unrecognized VolumeType from the SDK \(value)")
            self = .unrecognized
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
    case validationError = 7

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
        case .validationError:
            self = .validationError
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
    case validationError = 6

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
        case .validationError:
            self = .validationError
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
