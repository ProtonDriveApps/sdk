import Foundation
import SwiftProtobuf

/// Handles photo upload operations for ProtonDrive
actor PhotoUploadsManager {

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

    func uploadPhotoOperation(
        name: String,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        mediaType: String,
        thumbnails: [ThumbnailData],
        overrideExistingDraft: Bool,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadOperation {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeUploads[cancellationToken] = cancellationTokenSource

        let uploaderHandle = try await buildUploader(
            name: name,
            fileSize: fileSize,
            modificationDate: modificationDate,
            mediaType: mediaType,
            overrideExistingDraft: overrideExistingDraft,
            cancellationHandle: cancellationTokenSource.handle
        )

        let uploadController = try await uploadFromFile(
            fileUploaderHandle: uploaderHandle,
            fileURL: fileURL,
            progressCallback: progressCallback,
            cancellationToken: cancellationToken,
            cancellationHandle: cancellationTokenSource.handle,
            thumbnails: thumbnails
        )
        return uploadController
    }

    private func uploadFromFile(
        fileUploaderHandle: ObjectHandle,
        fileURL: URL,
        progressCallback: @escaping ProgressCallback,
        cancellationToken: UUID,
        cancellationHandle: ObjectHandle,
        thumbnails: [ThumbnailData]
    ) async throws -> UploadOperation {
        let thumbnails = thumbnails.map {
            let count = $0.data.count
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: count)
            $0.data.copyBytes(to: buffer, count: count)
            return ($0.type, ObjectHandle(bitPattern: buffer), count)
        }
        let deallocateBuffers: @Sendable () -> Void = {
            thumbnails.forEach { _, handle, count in
                let pointer = UnsafeMutableRawPointer(bitPattern: handle)
                UnsafeMutableRawBufferPointer(start: pointer, count: count).deallocate()
            }
        }
        let uploaderRequest = Proton_Drive_Sdk_DrivePhotosClientUploadFromFileRequest.with {
            $0.uploaderHandle = Int64(fileUploaderHandle)
            $0.filePath = fileURL.path(percentEncoded: false)
            $0.progressAction = Int64(ObjectHandle(callback: cProgressCallback))
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
            $0.thumbnails = thumbnails.map { type, handle, count in
                Proton_Drive_Sdk_Thumbnail.with {
                    $0.type = type == .thumbnail ? .thumbnail : .preview
                    $0.dataPointer = Int64(handle)
                    $0.dataLength = Int64(count)
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

        return UploadOperation(
            fileUploaderHandle: fileUploaderHandle,
            uploadControllerHandle: uploadControllerHandle,
            progressCallbackWrapper: callbackState,
            logger: logger,
            nodeType: .photo,
            onOperationCancel: { [weak self] in
                guard let self else { return }
                try await self.cancelUpload(with: cancellationToken)
            },
            onOperationDispose: { [weak self] in
                guard let self else { return }
                deallocateBuffers()
                await self.freeCancellationTokenSourceIfNeeded(cancellationToken: cancellationToken)
            }
        )
    }

    // API to cancel operation when the client does not use the UploadOperation
    func cancelUpload(with cancellationToken: UUID) async throws {
        guard let uploadCancellationToken = activeUploads[cancellationToken] else {
            throw ProtonDriveSDKError(interopError: .noCancellationTokenForIdentifier(operation: "upload"))
        }

        try await uploadCancellationToken.cancel()

        activeUploads[cancellationToken] = nil
        uploadCancellationToken.free()
    }

    private func freeCancellationTokenSourceIfNeeded(cancellationToken: UUID) {
        guard let cancellationTokenSource = activeUploads[cancellationToken] else { return }
        activeUploads[cancellationToken] = nil
        cancellationTokenSource.free()
    }

    /// Get a photo uploader for uploading files to Drive
    private func buildUploader(
        name: String,
        fileSize: Int64,
        modificationDate: Date,
        mediaType: String,
        overrideExistingDraft: Bool,
        cancellationHandle: ObjectHandle
    ) async throws -> ObjectHandle {
        let uploaderRequest = Proton_Drive_Sdk_DrivePhotosClientGetPhotoUploaderRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.name = name
            $0.size = fileSize
            $0.metadata = Proton_Drive_Sdk_PhotoFileUploadMetadata.with { metadata in
                metadata.mediaType = mediaType
                metadata.lastModificationTime = Google_Protobuf_Timestamp(date: modificationDate)
                metadata.overrideExistingDraftByOtherClient = overrideExistingDraft
            }
            $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
        }

        let uploaderHandle: ObjectHandle = try await SDKRequestHandler.send(uploaderRequest, logger: logger)
        assert(uploaderHandle != 0)
        return uploaderHandle
    }
}
