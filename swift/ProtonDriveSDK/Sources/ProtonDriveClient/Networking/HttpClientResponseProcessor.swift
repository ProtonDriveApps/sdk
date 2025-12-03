import Foundation
import SwiftProtobuf

enum HttpClientResponseProcessor {
    
    // statePointer is bindings content handle,
    // byteArray is buffer,
    // callbackPointer is used for calling sdk back to let it know we've filled the buffer
    static let cCompatibleHttpResponseRead: CCallbackWithCallbackPointer = { statePointer, byteArray, callbackPointer in
        Task {
            do {
                guard let bindingsContentHandle = UnsafeRawPointer(bitPattern: statePointer)
                else {
                    assertionFailure("We must have a state pointer to perform this operation")
                    SDKResponseHandler.sendInteropErrorToSDK(
                        message: "Invalid state pointer",
                        callbackPointer: callbackPointer
                    )
                    return
                }   
                
                let buffer = UnsafeMutablePointer<UInt8>(mutating: byteArray.pointer)!
                let bufferSize = byteArray.length
                
                let boxedStreamingData = Unmanaged<BoxedStreamingData>.fromOpaque(bindingsContentHandle).takeUnretainedValue()
                
                if let boxedRawBuffer = boxedStreamingData.uploadBuffer {
                    try await HttpClientResponseProcessor.passResponseBytes(
                        boxedRawBuffer: boxedRawBuffer,
                        buffer: buffer,
                        bufferSize: bufferSize,
                        callbackPointer: callbackPointer,
                        releaseBox: {
                            _ = Unmanaged<BoxedStreamingData>.fromOpaque(bindingsContentHandle).takeRetainedValue()
                        }
                    )
                } else if let boxedDownloadStream = boxedStreamingData.downloadStream {
                    try await HttpClientResponseProcessor.passStream(
                        boxedDownloadStream: boxedDownloadStream,
                        buffer: buffer,
                        bufferSize: bufferSize,
                        callbackPointer: callbackPointer,
                        releaseBox: {
                            _ = Unmanaged<BoxedStreamingData>.fromOpaque(bindingsContentHandle).takeRetainedValue()
                        }
                    )
                } else {
                    assertionFailure("Failed to pass valid BytesOrStream")
                }
            } catch {
                SDKResponseHandler.sendErrorToSDK(error, callbackPointer: callbackPointer)
            }
        }
    }

    
    fileprivate static func passStream(
        boxedDownloadStream: BoxedDownloadStream,
        buffer: sending UnsafeMutablePointer<UInt8>,
        bufferSize: Int,
        callbackPointer: Int,
        releaseBox: () -> Void
    ) async throws {
        let (data, receivedBytes) = try await boxedDownloadStream.read(upTo: bufferSize)
        data.copyBytes(to: buffer, count: receivedBytes)
        let message = Google_Protobuf_Int32Value.with {
            $0.value = Int32(receivedBytes)
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: message)
        if bufferSize > receivedBytes {
            releaseBox()
        }
    }
    
    fileprivate static func passResponseBytes(
        boxedRawBuffer: BoxedRawBuffer,
        buffer: sending UnsafeMutablePointer<UInt8>,
        bufferSize: Int,
        callbackPointer: Int,
        releaseBox: () -> Void
    ) async throws {
        let copiedBytesCount = await boxedRawBuffer.copyBytes(to: buffer, count: bufferSize)

        let message = Google_Protobuf_Int32Value.with {
            $0.value = Int32(copiedBytesCount)
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: message)
        if copiedBytesCount == 0 {
            releaseBox()
        }
    }
}
