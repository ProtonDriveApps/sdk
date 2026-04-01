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

let cThumbnailEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<ThumbnailEnumerationCallbackWrapper>>
    let fileThumbnail = Proton_Drive_Sdk_FileThumbnail(byteArray: byteArray)
    let result = ThumbnailDataWithId(fileThumbnail: fileThumbnail)

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        let message = "cProgressCallback.statePointer is nil"
        assertionFailure(message)
        // there is no way we can inform the SDK back about the issue
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper: WeakReference<ThumbnailEnumerationCallbackWrapper> = stateTypedPointer.takeUnretainedValue().state
    weakWrapper.value?.callback(.success(result))
}
