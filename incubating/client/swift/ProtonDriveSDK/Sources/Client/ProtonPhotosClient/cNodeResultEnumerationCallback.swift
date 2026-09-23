import Foundation

final class NodeResultEnumerationCallbackWrapper: Sendable {
    let callback: NodeResultCallback

    init(callback: @escaping NodeResultCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cNodeResultEnumerationCallback: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Void, WeakReference<NodeResultEnumerationCallbackWrapper>>

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper = box.state

    let protoPair = Proton_Drive_Sdk_NodeResultPair(byteArray: byteArray)
    guard let result = NodeResult(sdkNodeResult: protoPair) else {
        weakWrapper.value?.callback(.failure(
            ProtonDriveSDKError(interopError: .incorrectIDFormat(id: protoPair.nodeUid))
        ))
        return
    }

    weakWrapper.value?.callback(.success(result))
}
