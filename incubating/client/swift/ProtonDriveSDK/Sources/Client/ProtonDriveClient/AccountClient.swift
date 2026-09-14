import Foundation
import SwiftProtobuf

public struct AccountClientAddress: Sendable {
    public enum Status: Sendable {
        case enabled
        case disabled
    }
    
    public struct Key: Sendable {
        let addressID: String
        let addressKeyID: String
        let isActive: Bool
        let isAllowedForEncryption: Bool
        let isAllowedForVerification: Bool
        
        public init(
            addressID: String,
            addressKeyID: String,
            isActive: Bool,
            isAllowedForEncryption: Bool,
            isAllowedForVerification: Bool
        ) {
            self.addressID = addressID
            self.addressKeyID = addressKeyID
            self.isActive = isActive
            self.isAllowedForEncryption = isAllowedForEncryption
            self.isAllowedForVerification = isAllowedForVerification
        }
    }
    
    let addressID: String
    let order: Int32
    let emailAddress: String
    let status: Status
    let primaryKeyIndex: Int32
    let keys: [Key]
    
    public init(
        addressID: String,
        order: Int32,
        emailAddress: String,
        status: Status,
        primaryKeyIndex: Int32,
        keys: [Key]
    ) {
        self.addressID = addressID
        self.order = order
        self.emailAddress = emailAddress
        self.status = status
        self.primaryKeyIndex = primaryKeyIndex
        self.keys = keys
    }
}

public protocol AccountClientProtocol: Sendable {
    func getAddress(addressId: String) -> AccountClientAddress?
    func getDefaultAddress() -> AccountClientAddress?
    func getAddressPrimaryPrivateKey(addressId: String) -> Data?
    func getAddressPrivateKeys(addressId: String) -> [Data]?
    func getAddressPublicKeysRequest(emailAddress: String) -> [Data]
}

let cCompatibleAccountClientRequest: CCallbackWithCallbackPointer = { statePointer, byteArray, callbackPointer in
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        SDKResponseHandler.sendInteropErrorToSDK(message: "cCompatibleAccountClientRequest.statePointer is null",
                                                 callbackPointer: callbackPointer)
        return
    }
    let stateTypedPointer = Unmanaged<BoxedCompletionBlock<Int, SDKClientProvider>>.fromOpaque(stateRawPointer)
    let provider: SDKClientProvider = stateTypedPointer.takeUnretainedValue().state

    guard
        let driveClient = provider.get(callbackPointer: callbackPointer, releaseBox: {
            // we don't release the stateTypedPointer by design — there might be some calls coming from the SDK racing with the client deallocation
            // stateTypedPointer.release()
        })
    else { return }

    Task { [driveClient] in
        let accountClient = driveClient.accountClient

        let request = Proton_Drive_Sdk_AccountRequest(byteArray: byteArray)

        switch request.payload {
        case .getAddress(let request):
            guard let address = accountClient.getAddress(addressId: request.addressID) else {
                SDKResponseHandler.sendInteropErrorToSDK(message: "cCompatibleAccountClientRequest.address is null",
                                                         callbackPointer: callbackPointer)
                return
            }
            let protoAddress = address.makeProtoAddress()
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: protoAddress)
        case .getDefaultAddress(let request):
            guard let address = accountClient.getDefaultAddress() else {
                SDKResponseHandler.sendInteropErrorToSDK(message: "cCompatibleAccountClientRequest.defaultAddress is null",
                                                         callbackPointer: callbackPointer)
                return
            }
            let protoAddress = address.makeProtoAddress()
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: protoAddress)
        case .getAddressPrimaryPrivateKey(let request):
            guard let key = accountClient.getAddressPrimaryPrivateKey(addressId: request.addressID) else {
                SDKResponseHandler.sendInteropErrorToSDK(message: "cCompatibleAccountClientRequest.key is null",
                                                         callbackPointer: callbackPointer)
                return
            }
            let bytesValue = Google_Protobuf_BytesValue.with {
                $0.value = key
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: bytesValue)
        case .getAddressPrivateKeys(let request):
            guard let privateKeys = accountClient.getAddressPrivateKeys(addressId: request.addressID) else {
                SDKResponseHandler.sendInteropErrorToSDK(message: "cCompatibleAccountClientRequest.privateKeys is null",
                                                         callbackPointer: callbackPointer)
                return
            }
            let repeatedBytes = Proton_Drive_Sdk_RepeatedBytesValue.with {
                $0.value = privateKeys
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: repeatedBytes)
        case .getAddressPublicKeys(let request):
            let publicKeys = accountClient.getAddressPublicKeysRequest(emailAddress: request.emailAddress)
            let repeatedBytes = Proton_Drive_Sdk_RepeatedBytesValue.with {
                $0.value = publicKeys
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: repeatedBytes)
        case nil:
            let message = "cCompatibleAccountClientRequest.Proton_Drive_Sdk_AccountRequest.payload is null"
            SDKResponseHandler.sendInteropErrorToSDK(message: message, callbackPointer: callbackPointer)
        }
    }
}

extension AccountClientAddress {
    func makeProtoAddress() -> Proton_Drive_Sdk_Address {
        return Proton_Drive_Sdk_Address.with {
            $0.addressID = addressID
            $0.order = Int32(order)
            $0.emailAddress = emailAddress
            let addressStatus: Proton_Drive_Sdk_AddressStatus = {
                switch status {
                case .disabled:
                    return .disabled
                case .enabled:
                    return .enabled
                }
            }()
            $0.status = addressStatus
            $0.primaryKeyIndex = primaryKeyIndex
            $0.keys = keys.map { key in
                Proton_Drive_Sdk_AddressKey.with {
                    $0.addressID = addressID
                    $0.addressKeyID = key.addressKeyID
                    $0.isActive = key.isActive
                    $0.isAllowedForEncryption = key.isAllowedForEncryption
                    $0.isAllowedForVerification = key.isAllowedForVerification
                }
            }
        }
    }
}
