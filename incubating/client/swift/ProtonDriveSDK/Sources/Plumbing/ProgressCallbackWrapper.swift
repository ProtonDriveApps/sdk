import Foundation
import CProtonDriveSDK

final class ProgressCallbackWrapper: Sendable {
    let callback: ProgressCallback

    init(callback: @escaping ProgressCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cProgressCallbackForUpload: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<UploadOperationState>>
    let progressUpdate = Proton_Drive_Sdk_ProgressUpdate(byteArray: byteArray)
    let progress = FileOperationProgress(
        bytesCompleted: progressUpdate.hasBytesCompleted ? progressUpdate.bytesCompleted : nil,
        bytesTotal: progressUpdate.hasBytesInTotal ? progressUpdate.bytesInTotal : nil
    )

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper: WeakReference<UploadOperationState> = box.state
    weakWrapper.value?.callback(progress)
}


let cProgressCallbackForDownload: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<ProgressCallbackWrapper>>
    let progressUpdate = Proton_Drive_Sdk_ProgressUpdate(byteArray: byteArray)
    let progress = FileOperationProgress(
        bytesCompleted: progressUpdate.hasBytesCompleted ? progressUpdate.bytesCompleted : nil,
        bytesTotal: progressUpdate.hasBytesInTotal ? progressUpdate.bytesInTotal : nil
    )

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper: WeakReference<ProgressCallbackWrapper> = box.state
    weakWrapper.value?.callback(progress)
}
