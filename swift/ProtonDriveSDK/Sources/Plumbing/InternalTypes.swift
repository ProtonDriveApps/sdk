import Foundation
import CProtonDriveSDK
import SwiftProtobuf

/// Used internally to pass around numbers representing memory addresses
typealias ObjectHandle = Int

extension ObjectHandle {
    /// Returns the address of a callback as a number
    init(callback: CCallback) {
        let callbackAddress: UnsafeRawPointer = unsafeBitCast(callback, to: UnsafeRawPointer.self)
        self = ObjectHandle(bitPattern: callbackAddress)
    }

    /// Returns the address of a callback as a number
    init(callback: CCallbackWithReturnValue) {
        let callbackAddress: UnsafeRawPointer = unsafeBitCast(callback, to: UnsafeRawPointer.self)
        self = ObjectHandle(bitPattern: callbackAddress)
    }
    
    init(callback: CResponseCallback) {
        let callbackAddress: UnsafeRawPointer = unsafeBitCast(callback, to: UnsafeRawPointer.self)
        self = ObjectHandle(bitPattern: callbackAddress)
    }
}

extension ObjectHandle {
    init(rawPointer: UnsafeRawPointer) {
        self.init(UInt(bitPattern: rawPointer))
    }
}

func address<T: AnyObject>(of object: T) -> ObjectHandle {
    let rawPointer = Unmanaged.passUnretained(object).toOpaque()
    return ObjectHandle(bitPattern: rawPointer)
}

/// C-compatible callback used to get response from the SDK
typealias CResponseCallback = @convention(c) (Int, ByteArray) -> Void

/// C-compatible callback used by SDK to pass data to the app
typealias CCallback = @convention(c) (UnsafeMutableRawPointer?, ByteArray) -> Void
typealias CCallbackWithReturnValue = @convention(c) (UnsafeMutableRawPointer, ByteArray, UnsafeMutableRawPointer) -> Void

extension Data {
    var dumptoString: String {
        String(data: self, encoding: .isoLatin2).map { String($0) } ?? "n/a"
    }
}

// MARK: - Error extensions

extension String: @retroactive Error {}

extension Proton_Sdk_Error: Error {

    var localizedDescription: String {
        return "\(self.message)"
    }

    var nsError: NSError {
        return NSError(domain: "ProtonDriveSDK", code: Int(primaryCode), userInfo: [
            NSLocalizedDescriptionKey: message
        ])
    }
}

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

extension Proton_Sdk_ProtonClientOptions {
    init(clientOptions: ClientOptions) {
        self = Proton_Sdk_ProtonClientOptions.with {
            if let baseUrl = clientOptions.baseUrl {
                $0.baseURL = baseUrl
            }

            if let userAgent = clientOptions.userAgent {
                $0.userAgent = userAgent
            }

            if let bindingsLanguage = clientOptions.bindingsLanguage {
                $0.bindingsLanguage = bindingsLanguage
            }

            if let tlsPolicy = clientOptions.tlsPolicy {
                $0.tlsPolicy = Proton_Sdk_ProtonClientTlsPolicy(tlsPolicy: tlsPolicy)
            }

            if let loggerProviderHandle = clientOptions.loggerProviderHandle {
                $0.loggerProviderHandle = Int64(loggerProviderHandle)
            }

            if let entityCachePath = clientOptions.entityCachePath {
                $0.entityCachePath = entityCachePath
            }
        }
    }
}

final class WeakReference<T> where T: AnyObject {
    private(set) weak var value: T?
    init(value: T) { self.value = value }
}
