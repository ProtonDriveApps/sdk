import Foundation
import SwiftProtobuf

/// Handles file upload operations for ProtonDrive
actor UploadsManager {

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

    func uploadFileOperation(
        parentFolderUid: SDKNodeUid,
        name: String,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        mediaType: String,
        thumbnails: [ThumbnailData],
        overrideExistingDraft: Bool,
        expectedSha1: Data?,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadOperation {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeUploads[cancellationToken] = cancellationTokenSource

        let cancellationHandle = cancellationTokenSource.handle

        let uploaderHandle = try await buildFileUploader(
            parentFolderUid: parentFolderUid.sdkCompatibleIdentifier,
            name: name,
            mediaType: mediaType,
            fileSize: fileSize,
            modificationDate: modificationDate,
            overrideExistingDraft: overrideExistingDraft,
            expectedSha1: expectedSha1,
            cancellationHandle: cancellationHandle,
            logger: logger
        )

        let uploadController = try await uploadFromFile(
            fileUploaderHandle: uploaderHandle,
            fileURL: fileURL,
            progressCallback: progressCallback,
            cancellationToken: cancellationToken,
            cancellationHandle: cancellationHandle,
            thumbnails: thumbnails
        )
        return uploadController
    }

    func uploadNewRevisionOperation(
        currentActiveRevisionUid: SDKRevisionUid,
        fileURL: URL,
        fileSize: Int64,
        modificationDate: Date,
        thumbnails: [ThumbnailData],
        expectedSha1: Data?,
        cancellationToken: UUID,
        progressCallback: @escaping ProgressCallback
    ) async throws -> UploadOperation {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeUploads[cancellationToken] = cancellationTokenSource

        let cancellationHandle = cancellationTokenSource.handle

        let uploaderHandle = try await getRevisionUploader(
            currentActiveRevisionUid: currentActiveRevisionUid,
            fileSize: fileSize,
            modificationDate: modificationDate,
            expectedSha1: expectedSha1,
            cancellationHandle: cancellationHandle
        )

        let uploadController = try await uploadFromFile(
            fileUploaderHandle: uploaderHandle,
            fileURL: fileURL,
            progressCallback: progressCallback,
            cancellationToken: cancellationToken,
            cancellationHandle: cancellationHandle,
            thumbnails: thumbnails
        )
        return uploadController
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
}

// MARK: - Revision uploader
extension UploadsManager {
    private func buildFileUploader(
        parentFolderUid: String,
        name: String,
        mediaType: String,
        fileSize: Int64,
        modificationDate: Date,
        overrideExistingDraft: Bool,
        expectedSha1: Data?,
        cancellationHandle: ObjectHandle?,
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

            if let expectedSha1 = expectedSha1 {
                $0.expectedSha1 = expectedSha1
            }

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
        expectedSha1: Data?,
        cancellationHandle: ObjectHandle?
    ) async throws -> ObjectHandle {
        let uploaderRequest = Proton_Drive_Sdk_DriveClientGetFileRevisionUploaderRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.currentActiveRevisionUid = currentActiveRevisionUid.sdkCompatibleIdentifier
            $0.size = fileSize
            $0.lastModificationTime = Google_Protobuf_Timestamp(date: modificationDate)
            if let expectedSha1 = expectedSha1 {
                $0.expectedSha1 = expectedSha1
            }
            if let cancellationHandle = cancellationHandle {
                $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
            }
        }

        let uploaderHandle: ObjectHandle = try await SDKRequestHandler.send(uploaderRequest, logger: logger)
        assert(uploaderHandle != 0)
        return uploaderHandle
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
        let uploaderRequest = Proton_Drive_Sdk_UploadFromFileRequest.with {
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
            nodeType: .file,
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
}
