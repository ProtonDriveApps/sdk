import Foundation

final class TimelineItemAccumulator: Sendable {
    nonisolated(unsafe) var items: [PhotoTimelineItem] = []

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cTimelineEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<TimelineItemAccumulator>>
    let protoItem = Proton_Drive_Sdk_PhotosTimelineItem(byteArray: byteArray)
    guard let item = PhotoTimelineItem(item: protoItem) else { return }

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cTimelineEnumerationCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakAccumulator = stateTypedPointer.takeUnretainedValue().state
    weakAccumulator.value?.items.append(item)
}
