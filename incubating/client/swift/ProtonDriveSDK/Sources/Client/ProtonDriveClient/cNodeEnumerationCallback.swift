import Foundation

final class NodeEnumerationCallbackWrapper: Sendable {
    let callback: NodeCallback

    init(callback: @escaping NodeCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cNodeEnumerationCallback: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Void, WeakReference<NodeEnumerationCallbackWrapper>>

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper = box.state

    let protoNode = Proton_Drive_Sdk_Node(byteArray: byteArray)
    do {
        let node = try DriveNode(sdkNode: protoNode)
        weakWrapper.value?.callback(.success(node))
    } catch {
        weakWrapper.value?.callback(.failure(error))
    }
}
