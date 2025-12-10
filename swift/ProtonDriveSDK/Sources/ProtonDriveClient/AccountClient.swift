import Foundation
import ProtonCoreDataModel
import SwiftProtobuf

public protocol AccountClientProtocol: Sendable {
    func getAddress(addressId: String) -> Address
    func getDefaultAddress() -> Address
    func getAddressPrimaryPrivateKey(addressId: String) -> Data
    func getAddressPrivateKeys(addressId: String) -> [Data]
    func getAddressPublicKeysRequest(emailAddress: String) -> [Data]
}

let cCompatibleAccountClientRequest: CCallbackWithCallbackPointer = { statePointer, byteArray, callbackPointer in
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        SDKResponseHandler.sendInteropErrorToSDK(message: "cCompatibleAccountClientRequest.statePointer is null",
                                                 callbackPointer: callbackPointer)
        return
    }
    let stateTypedPointer = Unmanaged<BoxedCompletionBlock<Int, WeakReference<ProtonDriveClient>>>.fromOpaque(stateRawPointer)
    let weakDriveClient: WeakReference<ProtonDriveClient> = stateTypedPointer.takeUnretainedValue().state
    
    let driveClient = ProtonDriveClient.unbox(
        callbackPointer: callbackPointer, releaseBox: { stateTypedPointer.release() }, weakDriveClient: weakDriveClient
    )
    guard let driveClient else { return }

    Task { [driveClient] in
        let accountClient = await driveClient.accountClient

        let request = Proton_Drive_Sdk_AccountRequest(byteArray: byteArray)

        switch request.payload {
        case .getAddress(let request):
            let address = accountClient.getAddress(addressId: request.addressID)
            let protoAddress = address.makeProtoAddress()
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: protoAddress)
        case .getDefaultAddress(let request):
            let address = accountClient.getDefaultAddress()
            let protoAddress = address.makeProtoAddress()
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: protoAddress)
        case .getAddressPrimaryPrivateKey(let request):
            let key = accountClient.getAddressPrimaryPrivateKey(addressId: request.addressID)
            let bytesValue = Google_Protobuf_BytesValue.with {
                $0.value = key
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: bytesValue)
        case .getAddressPrivateKeys(let request):
            let privateKeys = accountClient.getAddressPrivateKeys(addressId: request.addressID)
            let repeatedBytes = Proton_Sdk_RepeatedBytesValue.with {
                $0.value = privateKeys
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: repeatedBytes)
        case .getAddressPublicKeys(let request):
            let publicKeys = accountClient.getAddressPublicKeysRequest(emailAddress: request.emailAddress)
            let repeatedBytes = Proton_Sdk_RepeatedBytesValue.with {
                $0.value = publicKeys
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: repeatedBytes)
        case nil:
            let message = "cCompatibleAccountClientRequest.Proton_Drive_Sdk_AccountRequest.payload is null"
            SDKResponseHandler.sendInteropErrorToSDK(message: message, callbackPointer: callbackPointer)
        }
    }
}

extension ProtonCoreDataModel.Address {
    func makeProtoAddress() -> Proton_Sdk_Address {
        return Proton_Sdk_Address.with {
            $0.addressID = addressID
            $0.order = Int32(order)
            $0.emailAddress = email
            let addressStatus: Proton_Sdk_AddressStatus = {
                switch status {
                case .disabled:
                    return .disabled
                case .enabled:
                    return .enabled
                }
            }()
            $0.status = addressStatus
            $0.primaryKeyIndex = Int32(keys.firstIndex(where: { $0.primary == 1 }) ?? 0)
            $0.keys = keys.map { key in
                Proton_Sdk_AddressKey.with {
                    $0.addressID = addressID
                    $0.addressKeyID = key.keyID
                    $0.isActive = key.active == 1
                    $0.isAllowedForEncryption = key.isAllowedForEncryption //TODO double check
                    $0.isAllowedForVerification = key.isAllowedForVerification
                }
            }
        }
    }
}

fileprivate extension Key {
    var isAllowedForEncryption: Bool {
        KeyFlags(rawValue: UInt8(truncating: keyFlags as NSNumber)).contains(.encryptNewData)
    }

    var isAllowedForVerification: Bool {
        KeyFlags(rawValue: UInt8(truncating: keyFlags as NSNumber)).contains(.verifySignatures)
    }
}
