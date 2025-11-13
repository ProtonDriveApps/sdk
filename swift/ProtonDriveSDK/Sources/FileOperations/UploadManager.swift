import Foundation
import SwiftProtobuf

/// Handles file upload operations for ProtonDrive
public actor UploadManager {
    enum Error: Swift.Error {
        case noCancellationTokenForIdentifier
    }

    private let clientHandle: ObjectHandle
    private let logger: Logger?
    private var activeUploads: [UUID: CancellationTokenSource] = [:]

    init(clientHandle: ObjectHandle, logger: Logger?) {
        self.clientHandle = clientHandle
        self.logger = logger
    }

    deinit {
        activeUploads.values.forEach {
            $0.free()
        }
    }

    /// Upload file from file URL with complete upload flow
    public func uploadFile(
        parentFolderUid: SDKNodeUid,
        name: String,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        mediaType: String,
        thumbnails: [ThumbnailData] = [],
        overrideExistingDraft: Bool = false,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> FileNodeUploadResult {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeUploads[cancellationToken] = cancellationTokenSource

        defer {
            activeUploads[cancellationToken] = cancellationTokenSource
            cancellationTokenSource.free()
        }

        let cancellationHandle = cancellationTokenSource.handle

        let uploaderHandle = try await buildFileUploader(
            parentFolderUid: parentFolderUid.sdkCompatibleIdentifier,
            name: name,
            mediaType: mediaType,
            fileSize: fileSize,
            modificationDate: modificationDate,
            overrideExistingDraft: overrideExistingDraft,
            cancellationHandle: cancellationTokenSource.handle,
            logger: logger
        )

        defer {
            freeFileUploader(uploaderHandle)
        }

        let uploadedNode = try await uploadFromFile(
            uploaderHandle: uploaderHandle,
            fileURL: fileURL,
            progressCallback: progressCallback,
            cancellationHandle: cancellationHandle,
            thumbnails: thumbnails
        )
        return uploadedNode
    }

    public func uploadNewRevision(
        currentActiveRevisionUid: SDKRevisionUid,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        thumbnails: [ThumbnailData],
        progressCallback: @escaping ProgressCallback
    ) async throws -> FileNodeUploadResult {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        defer {
            // TODO: Should be done in deinit!
            cancellationTokenSource.free()
        }

        let cancellationHandle = cancellationTokenSource.handle

        let uploaderHandle = try await getRevisionUploader(
            currentActiveRevisionUid: currentActiveRevisionUid,
            fileSize: fileSize,
            modificationDate: modificationDate,
            cancellationHandle: cancellationHandle
        )
        let uploadedNode = try await uploadFromFile(
            uploaderHandle: uploaderHandle,
            fileURL: fileURL,
            progressCallback: progressCallback,
            cancellationHandle: cancellationHandle,
            thumbnails: thumbnails
        )
        return uploadedNode
    }

    func cancelUpload(with cancellationToken: UUID) async throws {
        guard let uploadCancellationToken = activeUploads[cancellationToken] else {
            throw Error.noCancellationTokenForIdentifier
        }

        try await uploadCancellationToken.cancel()
        try await uploadCancellationToken.free()

        activeUploads[cancellationToken] = nil
    }
}

// MARK: - Revision uploader
extension UploadManager {
    private func buildFileUploader(
        parentFolderUid: String,
        name: String,
        mediaType: String,
        fileSize: Int64,
        modificationDate: Date,
        overrideExistingDraft: Bool = false,
        cancellationHandle: ObjectHandle? = nil,
        logger: Logger?
    ) async throws -> ObjectHandle {
        let uploaderRequest = Proton_Drive_Sdk_DriveClientGetFileUploaderRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.parentFolderUid = parentFolderUid
            $0.name = name
            $0.mediaType = mediaType
            $0.size = fileSize
            $0.lastModificationTime = Google_Protobuf_Timestamp(date: modificationDate)
            $0.overrideExistingDraftByOtherClient = overrideExistingDraft

            if let cancellationHandle = cancellationHandle {
                $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
            }
        }

        let uploaderHandle: ObjectHandle = try await SDKRequestHandler.send(uploaderRequest, logger: logger)
        assert(uploaderHandle != 0)
        return uploaderHandle
    }

    private func getRevisionUploader(
        currentActiveRevisionUid: SDKRevisionUid,
        fileSize: Int64,
        modificationDate: Date,
        cancellationHandle: ObjectHandle? = nil
    ) async throws -> ObjectHandle {
        let uploaderRequest = Proton_Drive_Sdk_DriveClientGetFileRevisionUploaderRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.currentActiveRevisionUid = currentActiveRevisionUid.sdkCompatibleIdentifier
            $0.size = fileSize
            $0.lastModificationTime = Google_Protobuf_Timestamp(date: modificationDate)
            if let cancellationHandle = cancellationHandle {
                $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
            }
        }

        let uploaderHandle: ObjectHandle = try await SDKRequestHandler.send(uploaderRequest, logger: logger)
        assert(uploaderHandle != 0)
        return uploaderHandle
    }

    private func uploadFromFile(
        uploaderHandle: ObjectHandle,
        fileURL: URL,
        progressCallback: @escaping ProgressCallback,
        cancellationHandle: ObjectHandle,
        thumbnails: [ThumbnailData]
    ) async throws -> FileNodeUploadResult {
        let uploaderRequest = Proton_Drive_Sdk_UploadFromFileRequest.with {
            $0.uploaderHandle = Int64(uploaderHandle)
            $0.filePath = fileURL.path(percentEncoded: false)
            $0.progressAction = Int64(ObjectHandle(callback: cProgressCallback))
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
            $0.thumbnails = thumbnails.map { thumbnail in
                Proton_Drive_Sdk_Thumbnail.with {
                    $0.type = thumbnail.type == .thumbnail ? .thumbnail : .preview
                    $0.contentLength = Int64(thumbnail.data.count)
                    let dataHandle = thumbnail.data.withUnsafeBytes { (u8Ptr: UnsafePointer<UInt8>) in
                        return ObjectHandle(bitPattern: UnsafeRawPointer(u8Ptr))
                    }
                    $0.contentPointer = Int64(dataHandle)
                }
            }
        }

        let callbackState = ProgressCallbackWrapper(callback: progressCallback)
        let uploadControllerHandle: ObjectHandle = try await SDKRequestHandler.send(
            uploaderRequest,
            state: WeakReference(value: callbackState),
            includesLongLivedCallback: true,
            logger: logger
        )
        assert(uploadControllerHandle != 0)

        let uploadedNode = try await awaitUploadCompletion(uploadControllerHandle)
        return uploadedNode
    }

    /// Free a file uploader when no longer needed
    private func freeFileUploader(_ fileUploaderHandle: ObjectHandle) {
        let freeRequest = Proton_Drive_Sdk_FileUploaderFreeRequest.with {
            $0.fileUploaderHandle = Int64(fileUploaderHandle)
        }

        Task {
            try await SDKRequestHandler.send(freeRequest, logger: logger) as Void
        }
    }

    /// Wait for upload completion
    private func awaitUploadCompletion(_ uploadControllerHandle: ObjectHandle) async throws -> FileNodeUploadResult {
        assert(uploadControllerHandle != 0)
        let awaitUploadCompletionRequest = Proton_Drive_Sdk_UploadControllerAwaitCompletionRequest.with {
            $0.uploadControllerHandle = Int64(uploadControllerHandle)
        }

        let uploadResult: Proton_Drive_Sdk_UploadResult = try await SDKRequestHandler.send(awaitUploadCompletionRequest, logger: logger)
        guard let result = FileNodeUploadResult(interopUploadResult: uploadResult) else {
            throw ProtonDriveSDKError(interopError: .wrongResult(message: "Wrong uid format in Proton_Drive_Sdk_UploadResult: \(uploadResult)"))
        }
        return result
    }
}
