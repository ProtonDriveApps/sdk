import Foundation
import SwiftProtobuf

struct AdditionalErrorDataFactory {
    func make(data: Google_Protobuf_Any) -> AdditionalErrorData? {
        return NodeNameConflictErrorData(data: data)
            ?? MissingContentBlockErrorData(data: data)
            ?? ContentSizeMismatchErrorData(data: data)
            ?? ThumbnailCountMismatchErrorData(data: data)
            ?? ChecksumMismatchErrorData(data: data)
    }
}

public protocol AdditionalErrorData: Sendable {
    func toProtobufAny() -> Google_Protobuf_Any?
    func errorDescription() -> String
}

public struct NodeNameConflictErrorData: AdditionalErrorData {
    public let isFileDraft: Bool
    /// Conflicting node UID
    public let nodeUID: SDKNodeUid?
    /// Conflicting revision UID
    public let revisionUID: SDKRevisionUid?

    init?(data: Google_Protobuf_Any) {
        do {
            let errorData = try Proton_Drive_Sdk_NodeNameConflictErrorData(unpackingAny: data)
            self.isFileDraft = errorData.hasConflictingNodeIsFileDraft ? errorData.conflictingNodeIsFileDraft : false
            let nodeUIDStr = errorData.hasConflictingNodeUid ? errorData.conflictingNodeUid : ""
            self.nodeUID = SDKNodeUid(sdkCompatibleIdentifier: nodeUIDStr)
            let revisionUIDStr = errorData.hasConflictingRevisionUid ? errorData.conflictingRevisionUid : ""
            self.revisionUID = SDKRevisionUid(sdkCompatibleIdentifier: revisionUIDStr)
        } catch {
            return nil
        }
    }

    public func toProtobufAny() -> Google_Protobuf_Any? {
        let errorData = Proton_Drive_Sdk_NodeNameConflictErrorData.with {
            $0.conflictingNodeIsFileDraft = isFileDraft
            if let conflictingNodeId = nodeUID {
                $0.conflictingNodeUid = conflictingNodeId.sdkCompatibleIdentifier
            }
            if let conflictingRevisionUid = revisionUID {
                $0.conflictingRevisionUid = conflictingRevisionUid.sdkCompatibleIdentifier
            }
        }
        return try? Google_Protobuf_Any(message: errorData)
    }

    public func errorDescription() -> String {
        "isFileDraft: \(isFileDraft)), nodeUID: \(String(describing: nodeUID)), revisionUID: \(String(describing: revisionUID))"
    }
}

public struct MissingContentBlockErrorData: AdditionalErrorData {
    public let blockNumber: Int

    init?(data: Google_Protobuf_Any) {
        do {
            let errorData = try Proton_Drive_Sdk_MissingContentBlockErrorData(unpackingAny: data)
            self.blockNumber = errorData.hasBlockNumber ? Int(errorData.blockNumber) : 0
        } catch {
            return nil
        }
    }

    public func toProtobufAny() -> Google_Protobuf_Any? {
        let errorData = Proton_Drive_Sdk_MissingContentBlockErrorData.with {
            $0.blockNumber = Int32(blockNumber)
        }
        return try? Google_Protobuf_Any(message: errorData)
    }

    public func errorDescription() -> String {
        "block number: \(blockNumber)"
    }
}

public struct ContentSizeMismatchErrorData: AdditionalErrorData {
    public let uploadedSize: Int64
    public let expectedSize: Int64

    init?(data: Google_Protobuf_Any) {
        do {
            let errorData = try Proton_Drive_Sdk_ContentSizeMismatchErrorData(unpackingAny: data)
            self.uploadedSize = errorData.hasUploadedSize ? errorData.uploadedSize : 0
            self.expectedSize = errorData.hasExpectedSize ? errorData.expectedSize : 0
        } catch {
            return nil
        }
    }

    public func toProtobufAny() -> Google_Protobuf_Any? {
        let errorData = Proton_Drive_Sdk_ContentSizeMismatchErrorData.with {
            $0.uploadedSize = uploadedSize
            $0.expectedSize = expectedSize
        }
        return try? Google_Protobuf_Any(message: errorData)
    }

    public func errorDescription() -> String {
        "uploadedSize: \(uploadedSize), expectedSize: \(expectedSize)"
    }
}

public struct ThumbnailCountMismatchErrorData: AdditionalErrorData {
    public let uploadedBlockCount: Int
    public let expectedBlockCount: Int

    init?(data: Google_Protobuf_Any) {
        do {
            let errorData = try Proton_Drive_Sdk_ThumbnailCountMismatchErrorData(unpackingAny: data)
            self.uploadedBlockCount = errorData.hasUploadedBlockCount ? Int(errorData.uploadedBlockCount) : 0
            self.expectedBlockCount = errorData.hasExpectedBlockCount ? Int(errorData.expectedBlockCount) : 0
        } catch {
            return nil
        }
    }

    public func toProtobufAny() -> Google_Protobuf_Any? {
        let errorData = Proton_Drive_Sdk_ThumbnailCountMismatchErrorData.with {
            $0.uploadedBlockCount = Int32(uploadedBlockCount)
            $0.expectedBlockCount = Int32(expectedBlockCount)
        }
        return try? Google_Protobuf_Any(message: errorData)
    }

    public func errorDescription() -> String {
        "uploadedBlockCount: \(uploadedBlockCount), expectedBlockCount: \(expectedBlockCount)"
    }
}

public struct ChecksumMismatchErrorData: AdditionalErrorData {
    public let actualChecksum: Data
    public let expectedChecksum: Data

    init?(data: Google_Protobuf_Any) {
        do {
            let errorData = try Proton_Drive_Sdk_ChecksumMismatchErrorData(unpackingAny: data)
            self.actualChecksum = errorData.hasActualChecksum ? errorData.actualChecksum : Data()
            self.expectedChecksum = errorData.hasExpectedChecksum ? errorData.expectedChecksum : Data()
        } catch {
            return nil
        }
    }

    public func toProtobufAny() -> Google_Protobuf_Any? {
        let errorData = Proton_Drive_Sdk_ChecksumMismatchErrorData.with {
            $0.actualChecksum = actualChecksum
            $0.expectedChecksum = expectedChecksum
        }
        return try? Google_Protobuf_Any(message: errorData)
    }

    public func errorDescription() -> String {
        "actual checksum: \(actualChecksum.map { String(format: "%02x", $0) }.joined()), expected checksum: \(expectedChecksum.map { String(format: "%02x", $0) }.joined())"
    }
}
