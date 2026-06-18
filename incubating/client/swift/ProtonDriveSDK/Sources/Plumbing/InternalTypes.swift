import Foundation
import CProtonDriveSDK
import SwiftProtobuf

/// Used internally to pass around numbers representing memory addresses
typealias ObjectHandle = Int

extension ObjectHandle {
    /// Returns the address of a callback as a number
    init<T>(callback: T) {
        let callbackAddress: UnsafeRawPointer = unsafeBitCast(callback, to: UnsafeRawPointer.self)
        self = ObjectHandle(bitPattern: callbackAddress)
    }
}

extension ObjectHandle {
    init(rawPointer: UnsafeRawPointer) {
        self.init(UInt(bitPattern: rawPointer))
    }
}

/// C-compatible callback used by SDK to pass data to the app and back
/// `statePointer` is pointer to the state we create on the app side and pass to the SDK in the request that is causing the callback to be called. SDK does not interact with the state at all, it just passes it back to the app. It's app's responsibility to maintain the lifecycle of the state (deallocate when appropriate). It's always passed, in every callback variant.
/// `byteArray` is a pointer and the count struct describing the memory allocated by the SDK, and passed to the callback to enable it to perform its operation. It is either the protobuf message created by the SDK that contains all the necessary information, or it's a memory buffer from which/into which the callback is supposed to read/write. The app does not maintain the lifecycle of the byteArray, it's SDK's responsibility. It's passed on the callback variants that require it for their work.
/// `callbackPointer` is a pointer to the callback created on the SDK side that keeps the SDK's async operation waiting. It's app's responsibility to make a response call (using `proton_sdk_handle_response`) and pass the operation result (be it success or error). If the app fails to do it, the operation might hang indefinitely. The lifecycle of the object under `callbackPointer` is SDK's responsibility. It's passed in the callbacks that are represented as async operations on the SDK side.

typealias CCallback = @convention(c) (_ statePointer: Int, _ byteArray: ByteArray) -> Void
typealias CCallbackWithoutByteArray = @convention(c) (_ statePointer: Int) -> Void
typealias CCallbackWithIntReturn = @convention(c) (_ statePointer: Int, _ byteArray: ByteArray) -> Int32
typealias CCallbackWithCallbackPointer = @convention(c) (_ statePointer: Int, _ byteArray: ByteArray, _ callbackPointer: Int) -> Void
typealias CCallbackWithCallbackPointerAndObjectPointerReturn = @convention(c) (_ statePointer: Int, _ byteArray: ByteArray, _ callbackPointer: Int) -> Int

// MARK: - ByteArray extensions

extension ByteArray: @unchecked @retroactive Sendable {}

extension ByteArray {
    init(data: Data) {
        if !data.isEmpty {
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: data.count)
            data.copyBytes(to: buffer, count: data.count)
            self.init(pointer: UnsafePointer(buffer), length: data.count)
        } else {
            self.init(pointer: nil, length: 0)
        }
    }

    /// Deallocate memory - call when done with the array
    func deallocate() {
        if let pointer = pointer {
            UnsafeMutablePointer(mutating: pointer).deallocate()
        }
    }
}

extension Data {
    init(byteArray: ByteArray) {
        if let pointer = byteArray.pointer {
            self.init(bytes: pointer, count: byteArray.length)
        } else {
            self.init()
        }
    }
}

// helper for debugging — makes inspecting data in the debugger easier
extension Data {
    var dumpToString: String {
        String(data: self, encoding: .isoLatin2).map { String($0) } ?? "n/a"
    }
}

// MARK: - Protobuf extensions

extension SwiftProtobuf.Message {
    var isDriveRequest: Bool {
        String(describing: self).starts(with: "ProtonDriveSDK.Proton_Drive_Sdk_")
    }
}

extension SwiftProtobuf.Message {
    init(byteArray: ByteArray) {
        guard let pointer = byteArray.pointer else { self.init(); return }

        let data = Data(bytes: pointer, count: byteArray.length)
        do {
            try self.init(serializedBytes: data)
        } catch {
            assertionFailure("The protobuf message could not be created")
            self.init()
        }
    }
}

extension Proton_Sdk_ProtonClientTlsPolicy {
    init(tlsPolicy: TlsPolicy) {
        switch tlsPolicy {
        case .strict:
            self = .strict

        case .noCertificatePinning:
            self = .noCertificatePinning

        case .noCertificateValidation:
            self = .noCertificateValidation
        }
    }
}

final class WeakReference<T> where T: AnyObject {
    private(set) weak var value: T?
    init(value: T) {
        self.value = value
    }
}
