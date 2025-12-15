import Foundation
import CProtonDriveSDK
import SwiftProtobuf

/// Sends requests to SDK and handles responses
enum SDKRequestHandler {

    // MARK: - Simple requests (without state)

    /// Async/await API for request without state for types with the generics documented via InteropRequest protocol.
    // TODO(SDK): document generics (message and return types) via InteropRequest for all calls.
    static func sendInteropRequest<T: Message & InteropRequest>(
        _ request: T,
        logger: Logger?
    ) async throws -> T.CallResultType
    where T.StateType == Void {
        try await send(request, logger: logger)
    }

    /// Async/await API for requests without state
    static func send<T: Message, U: Sendable>(
        _ request: T,
        logger: Logger?
    ) async throws -> U {
        try await send(request, state: (), logger: logger)
    }

    /// Completion block API for requests without state
    static func send<T: Message, U>(
        _ request: T,
        logger: Logger?,
        includesLongLivedCallback: Bool = false,
        completionBlock: @escaping (Result<U, Error>) -> Void
    ) {
        send(request, state: (), logger: logger, includesLongLivedCallback: includesLongLivedCallback, completionBlock: completionBlock)
    }

    // MARK: - Requests with additional state
    // `includesLongLivedCallback` property is used to know whether we need keep the box for state alive longer
    // than just until this method finished

    /// Async/await API for request with state for types with the generics documented via InteropRequest protocol.
    static func sendInteropRequest<T: Message & InteropRequest & Sendable>(
        _ request: T,
        state: T.StateType,
        includesLongLivedCallback: Bool = false,
        logger: Logger?
    ) async throws -> T.CallResultType {
        try await send(request, state: state, includesLongLivedCallback: includesLongLivedCallback, logger: logger)
    }

    /// Async/await API for requests with state
    static func send<T: Message, U: Sendable, V>(
        _ request: T,
        state: V,
        includesLongLivedCallback: Bool = false,
        logger: Logger?
    ) async throws -> U {
        try await withCheckedThrowingContinuation { continuation in
            send(request, state: state, logger: logger, includesLongLivedCallback: includesLongLivedCallback) { (result: Result<U, Error>) in
                switch result {
                case .success(let response):
                    continuation.resume(returning: response)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    /// Completion block API for requests with state
    static func send<T: Message, U, V>(
        _ request: T,
        state: V,
        logger: Logger?,
        includesLongLivedCallback: Bool = false,
        completionBlock: @escaping (Result<U, Error>) -> Void
    ) {
        do {
            // Put the request in an envelope
            let envelopedRequestData = try request.packIntoRequest().serializedData()
            let isDriveRequest = request.isDriveRequest
            logger?.trace("Sending SDK message with state: \(T.protoMessageName) - \(request)", category: "SDKRequestHandler")

            let requestArray = ByteArray(data: envelopedRequestData)
            defer {
                logger?.trace("deferred deallocate of requestData", category: "SDKRequestHandler")
                requestArray.deallocate()
            }

            logger?.trace("Sending (\(isDriveRequest ? "Drive" : "non-Drive")) SDK request ", category: "SDKRequestHandler")

            // Switch to InteropTypes.BoxedStateType once we use it for all requests
            let boxedState = BoxedCompletionBlock(completionBlock, state: state, context: envelopedRequestData)
            let pointer = Unmanaged.passRetained(boxedState)
            if includesLongLivedCallback {
                // We double-retain to keep the box alive after the method finishes.
                // Currently, the reference to the box will not be kept anywhere,
                // so the deallocation must be done in the long-lived callback. Improve if necessary.
                _ = pointer.retain() // fixes "result of call to 'retain()' is unused" warning
            }
            let bindingsHandle = Int(rawPointer: pointer.toOpaque())
            if isDriveRequest {
                logger?.trace(" -> proton_drive_sdk_handle_request", category: "SDKRequestHandler")
                proton_drive_sdk_handle_request(requestArray, bindingsHandle, sdkResponseCallbackWithState)
            } else {
                logger?.trace(" -> proton_sdk_handle_request", category: "SDKRequestHandler")
                proton_sdk_handle_request(requestArray, bindingsHandle, sdkResponseCallbackWithState)
            }
        } catch {
            completionBlock(.failure(error))
        }
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
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Received unexpected state in the response. We expected Resumable<Google_Protobuf_Int64Value>, we got \(type(of: box))"))
            }
            voidBox.resume()
        
        case .value(let value) where value.isA(Google_Protobuf_BoolValue.self):
            let unpackedValue = try Google_Protobuf_BoolValue(unpackingAny: value)
            guard let boolResultBox = box as? any Resumable<Bool> else {
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Received unexpected state in the response. We expected Resumable<Bool>, we got \(type(of: box))"))
            }
            boolResultBox.resume(returning: unpackedValue.value)

        case .value(let value) where value.isA(Google_Protobuf_Int64Value.self):
            let unpackedValue = try Google_Protobuf_Int64Value(unpackingAny: value).value
            switch box {
            case let int64Box as any Resumable<Int64>:
                int64Box.resume(returning: unpackedValue)
            case let intBox as any Resumable<Int>:
                intBox.resume(returning: Int(unpackedValue))
            default:
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Received unexpected state in the response. We expected Resumable<Google_Protobuf_Int64Value>, we got \(type(of: box))"))
            }

        case .value(let value) where value.isA(Google_Protobuf_Int32Value.self):
            let unpackedValue = try Google_Protobuf_Int32Value(unpackingAny: value).value
            switch box {
            case let int32Box as any Resumable<Int32>:
                int32Box.resume(returning: unpackedValue)
            case let intBox as any Resumable<Int>:
                intBox.resume(returning: Int(unpackedValue))
            default:
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Received unexpected state in the response. We expected Resumable<Google_Protobuf_Int32Value>, we got \(type(of: box))"))
            }

        case .value(let value) where value.isA(Proton_Drive_Sdk_UploadResult.self):
            let unpackedValue = try Proton_Drive_Sdk_UploadResult(unpackingAny: value)
            guard let uploadResultBox = box as? any Resumable<Proton_Drive_Sdk_UploadResult> else {
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Received unexpected state in the response. We expected Resumable<Proton_Drive_Sdk_UploadResult>, we got \(type(of: box))"))
            }
            uploadResultBox.resume(returning: unpackedValue)

        case .value(let value) where value.isA(Google_Protobuf_StringValue.self):
            let unpackedValue = try Google_Protobuf_StringValue(unpackingAny: value)
            guard let stringResultBox = box as? any Resumable<String> else {
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Received unexpected state in the response. We expected Resumable<String>, we got \(type(of: box))"))
            }
            stringResultBox.resume(returning: unpackedValue.value)

        case .value(let value) where value.isA(Proton_Drive_Sdk_FileThumbnailList.self):
            let unpackedValue = try Proton_Drive_Sdk_FileThumbnailList(unpackingAny: value)
            guard let uploadResultBox = box as? any Resumable<Proton_Drive_Sdk_FileThumbnailList> else {
                throw ProtonDriveSDKError(interopError: .wrongSDKResponse(message: "Received unexpected state in the response. We expected Resumable<Proton_Drive_Sdk_FileThumbnailList>, we got \(type(of: box))"))
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
