import Foundation

public typealias FeatureFlagProviderCallback = @Sendable (String, (Bool) -> Void) -> Void

let cCompatibleFeatureFlagProviderCallback: CCallbackWithIntReturn = { statePointer, byteArray in
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        let message = "cCompatibleFeatureFlagProviderCallback.statePointer is nil"
        assertionFailure(message)
        // there is no way we can inform the SDK back about the issue
        return 0
    }

    let stateTypedPointer = Unmanaged<BoxedCompletionBlock<Int, WeakReference<ProtonDriveClient>>>.fromOpaque(stateRawPointer)
    let weakDriveClient = stateTypedPointer.takeUnretainedValue().state

    guard let driveClient = weakDriveClient.value else {
        // we don't release the stateTypedPointer by design — there might be some calls coming from the SDK racing with the client deallocation
//        stateTypedPointer.release()
        return 0
    }

    // Convert ByteArray to String
    guard let pointer = byteArray.pointer else { return 0 }
    let data = Data(bytes: pointer, count: byteArray.length)
    guard let flagName = String(data: data, encoding: .utf8) else { return 0 }

    let result = driveClient.isFlagEnabled(flagName)
    return result ? 1 : 0
}
