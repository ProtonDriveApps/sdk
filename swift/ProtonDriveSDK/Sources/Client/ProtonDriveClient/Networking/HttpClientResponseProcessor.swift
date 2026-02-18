import Foundation
import SwiftProtobuf

enum HttpClientResponseProcessor {
    
    // statePointer is the registry handle for the BoxedStreamingData,
    // byteArray is buffer,
    // callbackPointer is used for calling sdk back to let it know we've filled the buffer
    static let cCompatibleHttpResponseRead: CCallbackWithCallbackPointer = { statePointer, byteArray, callbackPointer in
        guard statePointer != 0 else {
            let message = "cCompatibleHttpResponseRead.statePointer is null"
            SDKResponseHandler.sendInteropErrorToSDK(message: message, callbackPointer: callbackPointer)
            return
        }
        
        Task {
            guard let buffer = UnsafeMutablePointer<UInt8>(mutating: byteArray.pointer) else {
                let message = "cCompatibleHttpResponseRead.byteArray.pointer is null"
                SDKResponseHandler.sendInteropErrorToSDK(message: message, callbackPointer: callbackPointer)
                return
            }
            let bufferSize = byteArray.length
            
            guard let boxedStreamingData = CallbackHandleRegistry.shared.get(statePointer, as: BoxedStreamingData.self) else {
                SDKResponseHandler.sendInteropErrorToSDK(
                    message: "cCompatibleHttpResponseRead: BoxedStreamingData not found in registry (handle: \(statePointer))",
                    callbackPointer: callbackPointer
                )
                return
            }
            
            if let boxedRawBuffer = boxedStreamingData.uploadBuffer {
                await HttpClientResponseProcessor.passResponseBytes(
                    boxedRawBuffer: boxedRawBuffer,
                    buffer: buffer,
                    bufferSize: bufferSize,
                    callbackPointer: callbackPointer,
                    releaseBox: {
                        CallbackHandleRegistry.shared.remove(statePointer)
                    }
                )
            } else if let boxedDownloadStream = boxedStreamingData.downloadStream {
                await HttpClientResponseProcessor.passStream(
                    boxedDownloadStream: boxedDownloadStream,
                    buffer: buffer,
                    bufferSize: bufferSize,
                    callbackPointer: callbackPointer,
                    releaseBox: {
                        CallbackHandleRegistry.shared.remove(statePointer)
                    }
                )
            } else {
                CallbackHandleRegistry.shared.remove(statePointer)
                SDKResponseHandler.sendInteropErrorToSDK(message: "Failed to pass valid BytesOrStream",
                                                         callbackPointer: callbackPointer)
            }
        }
    }

    
    fileprivate static func passStream(
        boxedDownloadStream: BoxedDownloadStream,
        buffer: sending UnsafeMutablePointer<UInt8>,
        bufferSize: Int,
        callbackPointer: Int,
        releaseBox: () -> Void
    ) async {
        do {
            let (data, receivedBytes) = try await boxedDownloadStream.read(upTo: bufferSize)
            data.copyBytes(to: buffer, count: receivedBytes)
            let message = Google_Protobuf_Int32Value.with {
                $0.value = Int32(receivedBytes)
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: message)
            if bufferSize > receivedBytes {
                releaseBox()
            }
        } catch {
            SDKResponseHandler.sendErrorToSDK(error, callbackPointer: callbackPointer)
        }
    }
    
    fileprivate static func passResponseBytes(
        boxedRawBuffer: BoxedRawBuffer,
        buffer: sending UnsafeMutablePointer<UInt8>,
        bufferSize: Int,
        callbackPointer: Int,
        releaseBox: () -> Void
    ) async {
        let copiedBytesCount = boxedRawBuffer.copyBytes(to: buffer, count: bufferSize)

        let message = Google_Protobuf_Int32Value.with {
            $0.value = Int32(copiedBytesCount)
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: message)
        if copiedBytesCount == 0 {
            releaseBox()
        }
    }
}
