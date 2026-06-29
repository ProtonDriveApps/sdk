import Foundation

final class DeviceAccumulator: Sendable {
    nonisolated(unsafe) var devices: [Device] = []

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cDeviceEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<DeviceAccumulator>>
    let protoDevice = Proton_Drive_Sdk_Device(byteArray: byteArray)
    guard let device = try? Device(sdkDevice: protoDevice) else { return }

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cDeviceEnumerationCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakAccumulator = stateTypedPointer.takeUnretainedValue().state
    weakAccumulator.value?.devices.append(device)
}
