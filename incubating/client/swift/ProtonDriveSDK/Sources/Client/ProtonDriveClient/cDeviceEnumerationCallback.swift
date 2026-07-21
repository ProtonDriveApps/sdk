import Foundation

final class DeviceEnumerationCallbackWrapper: Sendable {
    let callback: DeviceCallback

    init(callback: @escaping DeviceCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cDeviceEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<DeviceEnumerationCallbackWrapper>>

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cDeviceEnumerationCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper = stateTypedPointer.takeUnretainedValue().state

    let protoDevice = Proton_Drive_Sdk_Device(byteArray: byteArray)
    do {
        let device = try Device(sdkDevice: protoDevice)
        weakWrapper.value?.callback(.success(device))
    } catch {
        weakWrapper.value?.callback(.failure(error))
    }
}
