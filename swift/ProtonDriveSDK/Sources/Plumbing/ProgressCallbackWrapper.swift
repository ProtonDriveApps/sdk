import Foundation
import CProtonDriveSDK

final class ProgressCallbackWrapper: Sendable {
    let callback: ProgressCallback

    init(callback: @escaping ProgressCallback) {
        self.callback = callback
    }
}

let cProgressCallbackForUpload: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<UploadOperationState>>
    let progressUpdate = Proton_Drive_Sdk_ProgressUpdate(byteArray: byteArray)
    let progress = FileOperationProgress(
        bytesCompleted: progressUpdate.hasBytesCompleted ? progressUpdate.bytesCompleted : nil,
        bytesTotal: progressUpdate.hasBytesInTotal ? progressUpdate.bytesInTotal : nil
    )

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        let message = "cProgressCallback.statePointer is nil"
        assertionFailure(message)
        // there is no way we can inform the SDK back about the issue
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper: WeakReference<UploadOperationState> = stateTypedPointer.takeUnretainedValue().state
    weakWrapper.value?.callback(progress)
}


let cProgressCallbackForDownload: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<ProgressCallbackWrapper>>
    let progressUpdate = Proton_Drive_Sdk_ProgressUpdate(byteArray: byteArray)
    let progress = FileOperationProgress(
        bytesCompleted: progressUpdate.hasBytesCompleted ? progressUpdate.bytesCompleted : nil,
        bytesTotal: progressUpdate.hasBytesInTotal ? progressUpdate.bytesInTotal : nil
    )

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        let message = "cProgressCallback.statePointer is nil"
        assertionFailure(message)
        // there is no way we can inform the SDK back about the issue
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper: WeakReference<ProgressCallbackWrapper> = stateTypedPointer.takeUnretainedValue().state
    weakWrapper.value?.callback(progress)
}
