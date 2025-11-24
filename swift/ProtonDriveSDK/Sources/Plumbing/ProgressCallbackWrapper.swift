import Foundation
import CProtonDriveSDK

final class ProgressCallbackWrapper {
    let callback: ProgressCallback

    init(callback: @escaping ProgressCallback) {
        self.callback = callback
    }
}

let cProgressCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedContinuationWithState<Int, WeakReference<ProgressCallbackWrapper>>
    let progressUpdate = Proton_Drive_Sdk_ProgressUpdate(byteArray: byteArray)
    let progress = FileOperationProgress(
        bytesCompleted: progressUpdate.bytesCompleted,
        bytesTotal: progressUpdate.bytesInTotal
    )

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else { return }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper: WeakReference<ProgressCallbackWrapper> = stateTypedPointer.takeUnretainedValue().state
    weakWrapper.value?.callback(progress)

    // TODO: also release pointer when task is cancelled
    if progress.isCompleted {
        stateTypedPointer.release()
    }
}
