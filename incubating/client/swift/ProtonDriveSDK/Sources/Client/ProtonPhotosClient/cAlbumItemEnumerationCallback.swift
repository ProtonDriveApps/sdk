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

let cAlbumItemEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<AlbumItemEnumerationCallbackWrapper>>

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cAlbumItemEnumerationCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper = stateTypedPointer.takeUnretainedValue().state

    let protoItem = Proton_Drive_Sdk_AlbumItem(byteArray: byteArray)
    guard let item = AlbumItem(item: protoItem) else { return }

    weakWrapper.value?.callback(.success(item))
}
