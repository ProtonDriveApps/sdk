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
        let sdkError = Proton_Sdk_Error.from(nsError: error as NSError)
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: sdkError)
    }
    
    /// A helper method to send an interop error from Swift bindings by providing just the message.
    /// The examples of interop errors are: unable to serialize/deserialize protobuf, unable to use a provide pointer etc.
    static func sendInteropErrorToSDK(message: String, callbackPointer: Int, assert: Bool = true) {
        if assert {
            assertionFailure(message)
        }
        let sdkError = Proton_Sdk_Error.with {
            $0.type = "Swift bindings"
            $0.domain = Proton_Sdk_ErrorDomain.businessLogic
            $0.message = message
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: sdkError)
    }
}

extension Proton_Sdk_Error {
    
    private static let encoder = JSONEncoder()
    
    static func from(nsError: NSError) -> Proton_Sdk_Error {
        let type: String
        let domain: Proton_Sdk_ErrorDomain
        let message: String
        var primaryCode: Int? = nil
        let secondaryCode: Int? = nil
        let context: String? = nil
        let innerError: Proton_Sdk_Error? = nil
        let additionalData: Codable? = nil

        switch nsError {

        case let protonDriveSDKError as ProtonDriveSDKError:
            return protonDriveSDKError.asProton_Sdk_Error
            
        case let cocoaError as CocoaError where cocoaError.code == .userCancelled:
            type = NSURLErrorDomain
            domain = .successfulCancellation
            message = cocoaError.localizedDescription
            
        case let urlError as URLError where urlError.code == .cancelled:
            type = NSURLErrorDomain
            domain = .successfulCancellation
            message = urlError.localizedDescription
            
        case let urlError as URLError:
            type = NSURLErrorDomain
            domain = .network
            message = urlError.localizedDescription
            primaryCode = urlError.code.rawValue
        
        default:
            type = nsError.domain
            domain = .undefined
            message = nsError.localizedDescription
            primaryCode = nsError.code
        }
        
        return Proton_Sdk_Error.with {
            $0.type = type
            $0.domain = domain
            $0.message = message
            if let primaryCode {
                $0.primaryCode = Int64(primaryCode)
            }
            if let secondaryCode {
                $0.secondaryCode = Int64(secondaryCode)
            }
            if let context {
                $0.context = context
            }
            if let innerError {
                $0.innerError = innerError
            }
            if let additionalData,
               let jsonData = try? encoder.encode(additionalData),
               let protobufData = try? Google_Protobuf_Any.init(jsonUTF8Data: jsonData) {
                $0.additionalData = protobufData
            }
        }
    }
}
