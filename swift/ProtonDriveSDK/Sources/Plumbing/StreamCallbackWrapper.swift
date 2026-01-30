import Foundation
import CProtonDriveSDK
import SwiftProtobuf

/// Wrapper that holds a SeekableOutputStream and progress callback for stream download operations.
/// Provides C-compatible callbacks for write, seek, and progress operations.
final class StreamDownloadState: @unchecked Sendable {
    let outputStream: SeekableOutputStream
    let progressCallback: ProgressCallback
    private let lock = NSLock()
    private var isReady = false
    private var bufferedProgress: [FileOperationProgress] = []

    init(outputStream: SeekableOutputStream, progressCallback: @escaping ProgressCallback) {
        self.outputStream = outputStream
        self.progressCallback = progressCallback
    }

    func markReady() {
        let buffered: [FileOperationProgress]
        lock.lock()
        isReady = true
        buffered = bufferedProgress
        bufferedProgress.removeAll()
        lock.unlock()

        for progress in buffered {
            progressCallback(progress)
        }
    }

    func handleProgress(_ progress: FileOperationProgress) {
        lock.lock()
        if !isReady {
            bufferedProgress.append(progress)
            lock.unlock()
            return
        }
        lock.unlock()
        progressCallback(progress)
    }
}

/// C-compatible callback for writing data to the output stream.
/// The SDK calls this with data that should be written to the stream.
/// Returns an operation handle that can be used to cancel the operation.
let cStreamWriteCallback: CCallbackWithCallbackPointerAndObjectPointerReturn = { statePointer, byteArray, callbackPointer in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<StreamDownloadState>>

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        SDKResponseHandler.sendInteropErrorToSDK(
            message: "cStreamWriteCallback.statePointer is nil",
            callbackPointer: callbackPointer
        )
        return 0
    }

    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper: WeakReference<StreamDownloadState> = stateTypedPointer.takeUnretainedValue().state

    guard let state = weakWrapper.value else {
        SDKResponseHandler.sendInteropErrorToSDK(
            message: "StreamDownloadState was deallocated",
            callbackPointer: callbackPointer
        )
        return 0
    }

    // Capture data before entering the task
    let data = Data(byteArray: byteArray)

    // Create a boxed task with the write work
    let taskBox = BoxedCancellableTask {
        do {
            try state.outputStream.write(data)
            SDKResponseHandler.sendVoidResponse(callbackPointer: callbackPointer)
        } catch {
            if Task.isCancelled {
                SDKResponseHandler.sendCancellationErrorToSDK(
                    message: "Write operation was cancelled",
                    callbackPointer: callbackPointer
                )
            } else {
                SDKResponseHandler.sendErrorToSDK(error, callbackPointer: callbackPointer)
            }
        }
    }

    // Retain the task box and return its address as the cancellation handle
    let unmanaged = Unmanaged.passRetained(taskBox)
    let handle = Int(bitPattern: unmanaged.toOpaque())

    // Set completion handler to release the Unmanaged reference when done
    taskBox.setCompletionHandler {
        unmanaged.release()
    }

    return handle
}

/// C-compatible callback for seeking in the output stream.
/// The SDK calls this with a StreamSeekRequest containing offset and origin.
/// Returns an operation handle that can be used to cancel the operation.
let cStreamSeekCallback: CCallbackWithCallbackPointerAndObjectPointerReturn = { statePointer, byteArray, callbackPointer in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<StreamDownloadState>>

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        SDKResponseHandler.sendInteropErrorToSDK(
            message: "cStreamSeekCallback.statePointer is nil",
            callbackPointer: callbackPointer
        )
        return 0
    }

    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper: WeakReference<StreamDownloadState> = stateTypedPointer.takeUnretainedValue().state

    guard let state = weakWrapper.value else {
        SDKResponseHandler.sendInteropErrorToSDK(
            message: "StreamDownloadState was deallocated",
            callbackPointer: callbackPointer
        )
        return 0
    }

    // Parse the seek request before entering the task
    let seekRequest = Proton_Sdk_StreamSeekRequest(byteArray: byteArray)
    let origin = SeekOrigin(rawValue: seekRequest.origin) ?? .begin

    // Create a boxed task with the seek work
    let taskBox = BoxedCancellableTask {
        do {
            let newPosition = try state.outputStream.seek(offset: seekRequest.offset, origin: origin)
            let int64Value = Google_Protobuf_Int64Value.with { $0.value = newPosition }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: int64Value)
        } catch {
            if Task.isCancelled {
                SDKResponseHandler.sendCancellationErrorToSDK(
                    message: "Seek operation was cancelled",
                    callbackPointer: callbackPointer
                )
            } else {
                SDKResponseHandler.sendErrorToSDK(error, callbackPointer: callbackPointer)
            }
        }
    }

    // Retain the task box and return its address as the cancellation handle
    let unmanaged = Unmanaged.passRetained(taskBox)
    let handle = Int(bitPattern: unmanaged.toOpaque())

    // Set completion handler to release the Unmanaged reference when done
    taskBox.setCompletionHandler {
        unmanaged.release()
    }

    return handle
}

/// C-compatible callback for progress updates during stream download.
/// The SDK calls this with progress information.
let cStreamProgressCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<StreamDownloadState>>
    let progressUpdate = Proton_Drive_Sdk_ProgressUpdate(byteArray: byteArray)
    let progress = FileOperationProgress(
        bytesCompleted: progressUpdate.hasBytesCompleted ? progressUpdate.bytesCompleted : nil,
        bytesTotal: progressUpdate.hasBytesInTotal ? progressUpdate.bytesInTotal : nil
    )

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cStreamProgressCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper: WeakReference<StreamDownloadState> = stateTypedPointer.takeUnretainedValue().state
    weakWrapper.value?.handleProgress(progress)
}

/// C-compatible callback for cancelling the stream operation.
/// The SDK calls this with the operation handle returned from write/seek callbacks.
let cStreamCancelCallback: CCallbackWithoutByteArray = { operationHandle in
    // If operationHandle is 0, it means we've early returned from the callback
    guard operationHandle != 0 else { return }

    // Convert the address back to the task box
    guard let pointer = UnsafeRawPointer(bitPattern: operationHandle) else {
        assertionFailure("cStreamCancelCallback.operationHandle is nil")
        return
    }

    // Get the task box and cancel it
    let unmanaged = Unmanaged<BoxedCancellableTask>.fromOpaque(pointer)
    let taskBox = unmanaged.takeUnretainedValue()
    // Release of the task box is wrapped in completionHandler, which is called in cancel()
    taskBox.cancel()
}
