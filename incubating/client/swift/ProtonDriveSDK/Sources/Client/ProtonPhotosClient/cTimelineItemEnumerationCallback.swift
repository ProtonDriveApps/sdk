import Foundation

final class TimelineItemEnumerationCallbackWrapper: Sendable {
    let callback: PhotoTimelineItemCallback

    init(callback: @escaping PhotoTimelineItemCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cTimelineItemEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<TimelineItemEnumerationCallbackWrapper>>

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cTimelineItemEnumerationCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper = stateTypedPointer.takeUnretainedValue().state

    let protoItem = Proton_Drive_Sdk_PhotosTimelineItem(byteArray: byteArray)
    guard let item = PhotoTimelineItem(item: protoItem) else { return }

    weakWrapper.value?.callback(.success(item))
}
