import Foundation
import CProtonDriveSDK

public enum UploadOperationResult: Sendable {
    case succeeded(UploadedFileIdentifiers)
    case pausedOnError(Error)
    case failed(Error)
}

public final class UploadOperation: Sendable {
    private let fileUploaderHandle: ObjectHandle
    private let uploadControllerHandle: ObjectHandle
    private let uploadOperationState: UploadOperationState
    private let logger: Logger?
    private let nodeType: NodeType
    private let expectedSHA1: Data?
    private let onOperationCancel: @Sendable () async throws -> Void
    private let onOperationDispose: @Sendable () async -> Void

    private var uploadControllerHandleForProto: Int64 { Int64(uploadControllerHandle) }

    init(fileUploaderHandle: ObjectHandle,
         uploadControllerHandle: ObjectHandle,
         uploadOperationState: UploadOperationState,
         logger: Logger?,
         nodeType: NodeType,
         expectedSHA1: Data? = nil,
         onOperationCancel: @Sendable @escaping () async throws -> Void,
         onOperationDispose: @Sendable @escaping () async -> Void) {
        assert(fileUploaderHandle != 0)
        assert(uploadControllerHandle != 0)
        self.fileUploaderHandle = fileUploaderHandle
        self.uploadControllerHandle = uploadControllerHandle
        self.uploadOperationState = uploadOperationState
        self.logger = logger
        self.nodeType = nodeType
        self.expectedSHA1 = expectedSHA1
        self.onOperationCancel = onOperationCancel
        self.onOperationDispose = onOperationDispose
    }

    public func awaitUploadWithResilience(
        operationalResilience: OperationalResilience,
        onRetriableErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> UploadedFileIdentifiers {
        try await awaitUploadWithResilience(
            retryCounter: 0, operationalResilience: operationalResilience, onPauseErrorReceived: onRetriableErrorReceived
        )
    }

    private func awaitUploadWithResilience(
        retryCounter: UInt, operationalResilience: OperationalResilience, onPauseErrorReceived: @Sendable @escaping (Error) -> Void
    ) async throws -> UploadedFileIdentifiers {
        let result = await awaitUploadCompletion(cleanUpTemporaryState: true)
        switch result {
        case .succeeded(let uploadResult):
            return uploadResult

        case .failed(let error):
            throw error

        case .pausedOnError(let error):
            do {
                onPauseErrorReceived(error)
                return try await operationalResilience.performRetry(retryCounter, error) {
                    try await resume()
                    return try await awaitUploadWithResilience(
                        retryCounter: $0, operationalResilience: operationalResilience, onPauseErrorReceived: onPauseErrorReceived
                    )
                }
            } catch {
                // if the retry throws, it means the operation cannot be recovered from anymore
                // in this case, we clean up the temporary state
                try? await cleanUpTemporaryState()
                throw error
            }
        }
    }

    /// Wait for upload completion
    public func awaitUploadCompletion(cleanUpTemporaryState: Bool = true) async -> UploadOperationResult {
        let awaitUploadCompletionRequest = Proton_Drive_Sdk_UploadControllerAwaitCompletionRequest.with {
            $0.uploadControllerHandle = uploadControllerHandleForProto
        }

        do {
            let uploadResult: Proton_Drive_Sdk_UploadResult = try await SDKRequestHandler.send(awaitUploadCompletionRequest,
                                                                                               logger: logger)
            guard let result = UploadedFileIdentifiers(interopUploadResult: uploadResult) else {
                throw ProtonDriveSDKError(
                    interopError: .wrongResult(message: "Wrong uid format in Proton_Drive_Sdk_UploadResult: \(uploadResult)")
                )
            }
            if cleanUpTemporaryState {
                try? await self.cleanUpTemporaryState()
            }
            return .succeeded(result)
        } catch {
            do {
                let isPaused = try await isPaused()
                if isPaused {
                    // if the operation is paused, we can try recovering from the error
                    // this is why this is the only scenario in which we do NOT clean up the temporary state
                    // the resume relies on that temporary state to be there
                    return .pausedOnError(error)
                } else {
                    if cleanUpTemporaryState {
                        try? await self.cleanUpTemporaryState()
                    }
                    return .failed(error)
                }
            } catch let isPausedError {
                logger?.info("Checking isPaused status failed with: \(isPausedError.localizedDescription)",
                             category: "UploadOperation")
                if cleanUpTemporaryState {
                    try? await self.cleanUpTemporaryState()
                }
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

    // allows the manual cleanup of temporary state on BE, like the draft being created there
    public func cleanUpTemporaryState() async throws {
        do {
            let disposeRequest = Proton_Drive_Sdk_UploadControllerDisposeRequest.with {
                $0.uploadControllerHandle = uploadControllerHandleForProto
            }
            try await SDKRequestHandler.send(disposeRequest, logger: logger) as Void
        } catch {
            // If the request to dispose the file upload controller failed, we have some BE state not cleaned up properly.
            // This might manifest in some user-visible errors on retry, but there is no clear way of handling the error, so we propagate it up.
            logger?.error("Proton_Drive_Sdk_UploadControllerDisposeRequest failed: \(error)",
                          category: "UploadController.disposeFileUploadController")
            throw error
        }
    }

    deinit {
        Self.freeSDKObjects(uploadControllerHandle, fileUploaderHandle, logger, nodeType, onOperationDispose)
    }

    private static func freeSDKObjects(
        _ uploadControllerHandle: ObjectHandle,
        _ fileUploaderHandle: ObjectHandle,
        _ logger: Logger?,
        _ nodeType: NodeType,
        _ onOperationDispose: @Sendable @escaping () async -> Void
    ) {
        Task {
            await onOperationDispose()
            await freeUploadController(Int64(uploadControllerHandle), logger: logger)
            switch nodeType {
            case .file:
                await freeFileUploader(Int64(fileUploaderHandle), logger)
            case .photo:
                await freePhotoUploader(Int64(fileUploaderHandle), logger)
            }
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
            logger?.error("Proton_Drive_Sdk_FileUploaderFreeRequest failed: \(error)",
                          category: "UploadManager.freeFileUploader")
        }
    }

    /// Free a photo uploader when no longer needed
    private static func freePhotoUploader(_ photoUploaderHandle: Int64, _ logger: Logger?) async {
        let freeRequest = Proton_Drive_Sdk_DrivePhotosClientUploaderFreeRequest.with {
            $0.fileUploaderHandle = photoUploaderHandle
        }
        do {
            try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
        } catch {
            // If the request to free the uploader failed, we have a memory leak, but not much else can be done.
            // It's not gonna break the app's functionality, so we just log the issue and continue.
            logger?.error("Proton_Drive_Sdk_DrivePhotosClientUploaderFreeRequest failed: \(error)",
                          category: "UploadManager.freeFileUploader")
        }
    }

    private static func freeUploadController(_ uploadControllerHandle: Int64, logger: Logger?) async {
        let freeRequest = Proton_Drive_Sdk_UploadControllerFreeRequest.with {
            $0.uploadControllerHandle = uploadControllerHandle
        }
        do {
            try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
        } catch {
            // If the request to free the file upload controller failed, we have a memory leak, but not much else can be done.
            // It's not gonna break the app's functionality, so we just log the issue and continue.
            logger?.error("Proton_Drive_Sdk_UploadControllerFreeRequest failed: \(error)",
                          category: "UploadController.freeFileUploadController")
        }
    }
}

final class UploadOperationState: Sendable {
    let callback: ProgressCallback
    let expectedSHA1: Data?
    
    init(callback: @escaping ProgressCallback, expectedSHA1: Data?) {
        self.callback = callback
        self.expectedSHA1 = expectedSHA1
    }
}

let cExpectedSha1CallbackForUpload: CCallbackWithByteArrayReturn = { statePointer in
    typealias BoxType = BoxedCompletionBlock<Int, WeakReference<UploadOperationState>>
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cExpectedSha1ProviderCallback.statePointer is nil")
        return ByteArray(pointer: nil, length: 0)
    }

    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    guard let expectedSHA1 = stateTypedPointer.takeUnretainedValue().state.value?.expectedSHA1 else {
        return ByteArray(pointer: nil, length: 0)
    }
    return ByteArray(data: expectedSHA1)
}
