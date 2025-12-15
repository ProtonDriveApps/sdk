import Foundation

public enum UploadOperationResult: Sendable {
    case succeeded(UploadedFileIdentifiers)
    case pausedOnError(Error)
    case failed(Error)
}

public final class UploadOperation: Sendable {
    private let fileUploaderHandle: ObjectHandle
    private let uploadControllerHandle: ObjectHandle
    private let progressCallbackWrapper: ProgressCallbackWrapper
    private let logger: Logger?
    private let onOperationCancel: @Sendable () async throws -> Void
    private let onOperationDispose: @Sendable () async -> Void
    
    private var uploadControllerHandleForProto: Int64 { Int64(uploadControllerHandle) }
    
    init(fileUploaderHandle: ObjectHandle,
         uploadControllerHandle: ObjectHandle,
         progressCallbackWrapper: ProgressCallbackWrapper,
         logger: Logger?,
         onOperationCancel: @Sendable @escaping () async throws -> Void,
         onOperationDispose: @Sendable @escaping () async -> Void) {
        assert(fileUploaderHandle != 0)
        assert(uploadControllerHandle != 0)
        self.fileUploaderHandle = fileUploaderHandle
        self.uploadControllerHandle = uploadControllerHandle
        self.progressCallbackWrapper = progressCallbackWrapper
        self.logger = logger
        self.onOperationCancel = onOperationCancel
        self.onOperationDispose = onOperationDispose
    }
    
    /// Wait for upload completion
    public func awaitUploadCompletion() async -> UploadOperationResult {
        let awaitUploadCompletionRequest = Proton_Drive_Sdk_UploadControllerAwaitCompletionRequest.with {
            $0.uploadControllerHandle = uploadControllerHandleForProto
        }

        do {
            let uploadResult: Proton_Drive_Sdk_UploadResult = try await SDKRequestHandler.send(awaitUploadCompletionRequest, logger: logger)
            guard let result = UploadedFileIdentifiers(interopUploadResult: uploadResult) else {
                throw ProtonDriveSDKError(interopError: .wrongResult(message: "Wrong uid format in Proton_Drive_Sdk_UploadResult: \(uploadResult)"))
            }
            return .succeeded(result)
        } catch {
            if let isPaused = try? await isPaused(), isPaused {
                return .pausedOnError(error)
            } else {
                return .failed(error)
            }
        }
    }
    
    public func pause() async throws {
        let pauseRequest = Proton_Drive_Sdk_UploadControllerPauseRequest.with {
            $0.uploadControllerHandle = uploadControllerHandleForProto
        }
        try await SDKRequestHandler.send(pauseRequest, logger: logger) as Void
    }
    
    public func resume() async throws {
        let resumeRequest = Proton_Drive_Sdk_UploadControllerResumeRequest.with {
            $0.uploadControllerHandle = uploadControllerHandleForProto
        }
        try await SDKRequestHandler.send(resumeRequest, logger: logger) as Void
    }
    
    public func isPaused() async throws -> Bool {
        let isPausedRequest = Proton_Drive_Sdk_UploadControllerIsPausedRequest.with {
            $0.uploadControllerHandle = uploadControllerHandleForProto
        }
        return try await SDKRequestHandler.send(isPausedRequest, logger: logger)
    }
    
    // a convenience API allowing for cancelling the operation through UploadOperation instance
    public func cancel() async throws {
        try await onOperationCancel()
    }
    
    deinit {
        Self.freeSDKObjects(uploadControllerHandle, fileUploaderHandle, logger, onOperationDispose)
    }
    
    private static func freeSDKObjects(
        _ uploadControllerHandle: ObjectHandle,
        _ fileUploaderHandle: ObjectHandle,
        _ logger: Logger?,
        _ onOperationDispose: @Sendable @escaping () async -> Void
    ) {
        Task {
            await onOperationDispose()
            await freeFileUploadController(Int64(uploadControllerHandle), logger: logger)
            await freeFileUploader(Int64(fileUploaderHandle), logger)
        }
    }
    
    private static func freeFileUploadController(_ uploadControllerHandle: Int64, logger: Logger?) async {
        let freeRequest = Proton_Drive_Sdk_UploadControllerFreeRequest.with {
            $0.uploadControllerHandle = uploadControllerHandle
        }
        do {
            try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
        } catch {
            // If the request to free the file upload controller failed, we have a memory leak, but not much else can be done.
            // It's not gonna break the app's functionality, so we just log the issue and continue.
            logger?.error("Proton_Drive_Sdk_UploadControllerFreeRequest failed: \(error)", category: "UploadController.freeFileUploadController")
        }
    }

    /// Free a file uploader when no longer needed
    private static func freeFileUploader(_ fileUploaderHandle: Int64, _ logger: Logger?) async {
        let freeRequest = Proton_Drive_Sdk_FileUploaderFreeRequest.with {
            $0.fileUploaderHandle = fileUploaderHandle
        }
        do {
            try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
        } catch {
            // If the request to free the file uploader failed, we have a memory leak, but not much else can be done.
            // It's not gonna break the app's functionality, so we just log the issue and continue.
            logger?.error("Proton_Drive_Sdk_FileUploaderFreeRequest failed: \(error)", category: "UploadManager.freeFileUploader")
        }
    }
}
