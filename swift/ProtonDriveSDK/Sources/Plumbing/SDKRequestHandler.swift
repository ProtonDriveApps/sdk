import Foundation
import CProtonDriveSDK
import SwiftProtobuf

/// Sends requests to SDK and handles responses
enum SDKRequestHandler {

    // MARK: - Simple requests (without state)

    static func sendInteropRequest<T: Message & InteropRequest>(_ request: T, logger: Logger?) async throws -> T.CallResultType
    where T.StateType == Void {
        try await send(request, logger: logger)
    }

    static func send<T: Message, U>(_ request: T, logger: Logger?) async throws -> U {
        try await send(request, state: (), logger: logger)
    }

    // MARK: - Requests with additional state
    // `includesLongLivedCallback` property is used to know whether we need keep the box for state alive longer
    // than just until this method finished

    static func sendInteropRequest<T: Message & InteropRequest>(
        _ request: T, state: T.StateType, includesLongLivedCallback: Bool = false, logger: Logger?
    ) async throws -> T.CallResultType {
        try await self.send(request, state: state, includesLongLivedCallback: includesLongLivedCallback, logger: logger)
    }

    static func send<T: Message, U, V>(
        _ request: T, state: V, includesLongLivedCallback: Bool = false, logger: Logger?
    ) async throws -> U {
        // Put the request in an envelope
        let envelopedRequestData = try request.packIntoRequest().serializedData()
        let isDriveRequest = request.isDriveRequest
        logger?.trace("Sending SDK message with state: \(T.protoMessageName) - \(request)", category: "SDKRequestHandler")

        let response: U = try await withCheckedThrowingContinuation { continuation in
            let requestArray = ByteArray(data: envelopedRequestData)
            defer {
                logger?.trace("deferred deallocate of requestData", category: "SDKRequestHandler")
                requestArray.deallocate()
            }

            logger?.trace("Sending (\(isDriveRequest ? "Drive" : "non-Drive")) SDK request ", category: "SDKRequestHandler")

            // Switch to InteropTypes.BoxedStateType once we use it for all requests
            let boxedState = BoxedContinuationWithState(continuation, state: state, context: envelopedRequestData)
            let pointer = Unmanaged.passRetained(boxedState)
            if includesLongLivedCallback {
                // We double-retain to keep the box alive after the method finishes.
                // Currently, the reference to the box will not be kept anywhere,
                // so the deallocation must be done in the long-lived callback. Improve if necessary.
                pointer.retain()
            }
            let bindingsHandle = Int(rawPointer: pointer.toOpaque())
            if isDriveRequest {
                logger?.trace(" -> proton_drive_sdk_handle_request", category: "SDKRequestHandler")
                proton_drive_sdk_handle_request(requestArray, bindingsHandle, sdkResponseCallbackWithState)
            } else {
                logger?.trace(" -> proton_sdk_handle_request", category: "SDKRequestHandler")
                proton_sdk_handle_request(requestArray, bindingsHandle, sdkResponseCallbackWithState)
            }
        }
        return response
    }
}

/// C-compatible callback function for SDK responses.
let sdkResponseCallbackWithState: CCallback = { statePointer, responseArray in
    guard let sdkPointer = UnsafeRawPointer(bitPattern: statePointer),
          let box = Unmanaged<AnyObject>.fromOpaque(sdkPointer).takeRetainedValue() as? any Resumable
    else {
        assertionFailure("If the pointer is not Resumable, we cannot get the continuation")
        return
    }

    let response = Proton_Sdk_Response(byteArray: responseArray)

    do {
        switch response.result {
        case nil: // empty response. Might be expected, might be not expected
            guard let voidBox = box as? any Resumable<Void> else {
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Unexpected empty response received"))
            }
            voidBox.resume()

        case .value(let value) where value.isA(Google_Protobuf_Int64Value.self):
            let unpackedValue = try Google_Protobuf_Int64Value(unpackingAny: value).value
            switch box {
            case let int64Box as any Resumable<Int64>:
                int64Box.resume(returning: unpackedValue)
            case let intBox as any Resumable<Int>:
                intBox.resume(returning: Int(unpackedValue))
            default:
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Unexpected SDK call response type: Google_Protobuf_Int64Value"))
            }

        case .value(let value) where value.isA(Proton_Drive_Sdk_UploadResult.self):
            let unpackedValue = try Proton_Drive_Sdk_UploadResult(unpackingAny: value)
            guard let uploadResultBox = box as? any Resumable<Proton_Drive_Sdk_UploadResult> else {
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Unexpected SDK call response type: Proton_Drive_Sdk_UploadResult"))
            }
            uploadResultBox.resume(returning: unpackedValue)

        case .value(let value) where value.isA(Google_Protobuf_StringValue.self):
            let unpackedValue = try Google_Protobuf_StringValue(unpackingAny: value)
            guard let stringResultBox = box as? any Resumable<String> else {
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Unexpected SDK call response type: String"))
            }
            stringResultBox.resume(returning: unpackedValue.value)

        case .value(let value) where value.isA(Proton_Drive_Sdk_FileThumbnailList.self):
            let unpackedValue = try Proton_Drive_Sdk_FileThumbnailList(unpackingAny: value)
            guard let uploadResultBox = box as? any Resumable<Proton_Drive_Sdk_FileThumbnailList> else {
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Unexpected SDK call response type: Proton_Drive_Sdk_FileThumbnailList"))
            }
            uploadResultBox.resume(returning: unpackedValue)

        case .value: // unknown value type
            throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Unknown SDK call response value type"))

        case .error(let error):
            throw ProtonDriveSDKError(protoError: error)
        }

    } catch {
        box.resume(throwing: error)
    }
}
