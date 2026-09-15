import Foundation

final class AlbumItemEnumerationCallbackWrapper: Sendable {
    let callback: AlbumItemCallback

    init(callback: @escaping AlbumItemCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cAlbumItemEnumerationCallback: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<AlbumItemEnumerationCallbackWrapper>>

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper = box.state

    let protoItem = Proton_Drive_Sdk_AlbumItem(byteArray: byteArray)
    guard let item = AlbumItem(item: protoItem) else { return }

    weakWrapper.value?.callback(.success(item))
}
