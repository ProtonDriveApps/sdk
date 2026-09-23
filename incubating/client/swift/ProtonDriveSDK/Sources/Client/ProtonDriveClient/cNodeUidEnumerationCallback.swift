import Foundation
import SwiftProtobuf

final class NodeUidEnumerationCallbackWrapper: Sendable {
    let callback: NodeUidCallback

    init(callback: @escaping NodeUidCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cNodeUidEnumerationCallback: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Void, WeakReference<NodeUidEnumerationCallbackWrapper>>

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper = box.state

    let stringValue = Google_Protobuf_StringValue(byteArray: byteArray)
    let rawValue = stringValue.value
    guard let nodeUid = SDKNodeUid(sdkCompatibleIdentifier: rawValue) else {
        weakWrapper.value?.callback(.failure(
            ProtonDriveSDKError(interopError: .incorrectIDFormat(id: rawValue))
        ))
        return
    }
    weakWrapper.value?.callback(.success(nodeUid))
}
