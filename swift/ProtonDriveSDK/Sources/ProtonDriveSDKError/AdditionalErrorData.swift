import Foundation
import SwiftProtobuf

struct AdditionalErrorDataFactory {
    func make(data: Google_Protobuf_Any) -> AdditionalErrorData? {
        return NodeNameConflictErrorData(data: data)
//            ?? SomeOtherErrorData(data: data)
    }
}

public protocol AdditionalErrorData: Sendable { }

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
}
