import Foundation

public typealias FeatureFlagProviderCallback = @Sendable (String) async -> Bool

let cCompatibleFeatureFlagProviderCallback: CCallbackWithIntReturn = { statePointer, byteArray in
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        return 0
    }

    let stateTypedPointer = Unmanaged<BoxedContinuationWithState<Int, WeakReference<ProtonDriveClient>>>.fromOpaque(stateRawPointer)
    let weakDriveClient = stateTypedPointer.takeUnretainedValue().state

    guard let driveClient = weakDriveClient.value else {
        stateTypedPointer.release()
        return 0
    }

    // Convert ByteArray to String
    guard let pointer = byteArray.pointer,
        let data = Data(bytes: pointer, count: byteArray.length),
        let flagName = String(data: data, encoding: .utf8) else {
        return 0
    }

    // Since the C# callback expects a synchronous return but our Swift callback is async,
    // we need to block and wait for the async result using a semaphore
    let semaphore = DispatchSemaphore(value: 0)
    var result = false

    Task {
        result = await driveClient.isFlagEnabled(flagName)
        semaphore.signal()
    }

    semaphore.wait()

    return result ? 1 : 0
}
