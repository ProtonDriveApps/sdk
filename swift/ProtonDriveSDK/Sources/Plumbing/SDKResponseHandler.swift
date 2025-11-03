import CProtonDriveSDK
import SwiftProtobuf

enum SDKResponseHandler {
    static func send(callbackPointer: Int, message: Message) {
        do {
            let byteArray = try message.serializedIntoResponse()
            proton_drive_sdk_handle_response(callbackPointer, byteArray)
            byteArray.deallocate()
        } catch {
            // TODO: this breaks SDK. We should definitely log this to Sentry. We might choose not to crash though.
            fatalError("SDKResponseHandler.send failed with \(error)")
        }
    }
}
