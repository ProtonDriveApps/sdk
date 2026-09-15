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

let cDeviceEnumerationCallback: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<DeviceEnumerationCallbackWrapper>>

    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    let weakWrapper = box.state

    let protoDevice = Proton_Drive_Sdk_Device(byteArray: byteArray)
    do {
        let device = try Device(sdkDevice: protoDevice)
        weakWrapper.value?.callback(.success(device))
    } catch {
        weakWrapper.value?.callback(.failure(error))
    }
}
