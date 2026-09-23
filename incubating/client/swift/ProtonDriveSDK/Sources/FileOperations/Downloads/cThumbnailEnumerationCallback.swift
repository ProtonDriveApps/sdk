import Foundation

final class ThumbnailEnumerationCallbackWrapper: Sendable {
    let callback: ThumbnailCallback

    init(callback: @escaping ThumbnailCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cThumbnailEnumerationCallback: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Void, WeakReference<ThumbnailEnumerationCallbackWrapper>>
    let fileThumbnail = Proton_Drive_Sdk_FileThumbnail(byteArray: byteArray)
    let result = ThumbnailDataWithId(fileThumbnail: fileThumbnail)

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper: WeakReference<ThumbnailEnumerationCallbackWrapper> = box.state
    weakWrapper.value?.callback(.success(result))
}
