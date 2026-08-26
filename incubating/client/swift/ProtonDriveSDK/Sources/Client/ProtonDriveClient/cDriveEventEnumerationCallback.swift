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

let cDriveEventEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<DriveEventEnumerationCallbackWrapper>>

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cDriveEventEnumerationCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper = stateTypedPointer.takeUnretainedValue().state

    let sdkDriveEvent = Proton_Drive_Sdk_DriveEvent(byteArray: byteArray)
    do {
        let driveEvent = try SDKDriveEvent(sdkDriveEvent: sdkDriveEvent)
        weakWrapper.value?.callback(.success(driveEvent))
    } catch {
        weakWrapper.value?.callback(.failure(error))
    }
}
