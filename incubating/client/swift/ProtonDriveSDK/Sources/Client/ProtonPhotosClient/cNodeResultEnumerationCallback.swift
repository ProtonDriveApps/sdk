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

let cNodeResultEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<NodeResultEnumerationCallbackWrapper>>

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cNodeResultEnumerationCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper = stateTypedPointer.takeUnretainedValue().state

    let protoPair = Proton_Drive_Sdk_NodeResultPair(byteArray: byteArray)
    guard let result = NodeResult(sdkNodeResult: protoPair) else {
        weakWrapper.value?.callback(.failure(
            ProtonDriveSDKError(interopError: .incorrectIDFormat(id: protoPair.nodeUid))
        ))
        return
    }

    weakWrapper.value?.callback(.success(result))
}
