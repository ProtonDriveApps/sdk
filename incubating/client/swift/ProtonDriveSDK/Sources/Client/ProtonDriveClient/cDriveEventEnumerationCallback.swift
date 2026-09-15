import Foundation
import SwiftProtobuf

final class DriveEventEnumerationCallbackWrapper: Sendable {
    let callback: DriveEventCallback

    init(callback: @escaping DriveEventCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cDriveEventEnumerationCallback: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<DriveEventEnumerationCallbackWrapper>>

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper = box.state

    let sdkDriveEvent = Proton_Drive_Sdk_DriveEvent(byteArray: byteArray)
    do {
        let driveEvent = try SDKDriveEvent(sdkDriveEvent: sdkDriveEvent)
        weakWrapper.value?.callback(.success(driveEvent))
    } catch {
        weakWrapper.value?.callback(.failure(error))
    }
}
