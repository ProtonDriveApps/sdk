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

let cTimelineItemEnumerationCallback: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Void, WeakReference<TimelineItemEnumerationCallbackWrapper>>

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper = box.state

    let protoItem = Proton_Drive_Sdk_PhotosTimelineItem(byteArray: byteArray)
    guard let item = PhotoTimelineItem(item: protoItem) else { return }

    weakWrapper.value?.callback(.success(item))
}
