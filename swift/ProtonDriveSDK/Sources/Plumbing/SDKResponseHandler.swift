import Foundation
import CProtonDriveSDK
import SwiftProtobuf

enum SDKResponseHandler {
    static func send(callbackPointer: Int, message: Message) {
        do {
            let byteArray = try message.serializedIntoResponse()
            proton_sdk_handle_response(callbackPointer, byteArray)
            byteArray.deallocate()
        } catch {
            // TODO: this breaks SDK. We should definitely log this to Sentry. We might choose not to crash though.
            fatalError("SDKResponseHandler.send failed with \(error)")
        }
    }
    
    static func sendErrorToSDK(_ error: Error, callbackPointer: Int) {
        sendErrorToSDK(error as NSError, callbackPointer: callbackPointer)
    }
    
    static func sendInteropErrorToSDK(message: String, callbackPointer: Int) {
        let error = Proton_Sdk_Error.with {
            $0.type = "interop"
            $0.domain = Proton_Sdk_ErrorDomain.businessLogic
            $0.message = message
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: error)
    }

    static func sendErrorToSDK(_ error: NSError, callbackPointer: Int) {
        // TODO(SDK): below we're just returning some rubbish
        let error = Proton_Sdk_Error.with {
            $0.type = "sdk error"
            $0.domain = Proton_Sdk_ErrorDomain.api
            $0.message = error.localizedDescription
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: error)
    }

}
