package me.proton.drive.sdk.internal

import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.toLongResponse
import me.proton.drive.sdk.extension.toProtobuf
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_PREVIEW
import proton.drive.sdk.ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_THUMBNAIL
import proton.drive.sdk.fileUploaderFreeRequest
import proton.drive.sdk.request
import proton.drive.sdk.thumbnail
import proton.drive.sdk.uploadFromStreamRequest
import java.nio.ByteBuffer

class JniFileUploader internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun getFileUploader(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
        request: FileUploaderRequest,
    ): Long = executeOnce("getFile", LongResponseCallback) {
        driveClientGetFileUploader =
            request.toProtobuf(clientHandle, cancellationTokenSourceHandle)
    }

    suspend fun getFileRevisionUploader(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
        request: FileRevisionUploaderRequest,
    ): Long = executeOnce("getFileRevision", LongResponseCallback) {
        driveClientGetFileRevisionUploader =
            request.toProtobuf(clientHandle, cancellationTokenSourceHandle)
    }

    suspend fun uploadFromStream(
        uploaderHandle: Long,
        cancellationTokenSourceHandle: Long,
        thumbnails: Map<ThumbnailType, ByteArray>,
        onRead: (ByteBuffer) -> Int,
        onProgress: suspend (ProtonDriveSdk.ProgressUpdate) -> Unit,
        coroutineScopeProvider: CoroutineScopeProvider,
    ): Long = executePersistent(
        clientBuilder = { continuation ->
            ProtonDriveSdkNativeClient(
                name = method("uploadFromStream"),
                response = continuation.toLongResponse().asClientResponseCallback(),
                read = onRead,
                progress = onProgress,
                logger = internalLogger,
                coroutineScopeProvider = coroutineScopeProvider,
            )
        },
        requestBuilder = { nativeClient ->
            request {
                uploadFromStream = uploadFromStreamRequest {
                    this.uploaderHandle = uploaderHandle
                    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
                    readAction = ProtonDriveSdkNativeClient.getReadPointer()
                    progressAction = ProtonDriveSdkNativeClient.getProgressPointer()
                    cancelAction = JniJob.getCancelPointer()
                    thumbnails.forEach { (type, data) ->
                        this.thumbnails.add(thumbnail {
                            this.type = when (type) {
                                ThumbnailType.THUMBNAIL -> THUMBNAIL_TYPE_THUMBNAIL
                                ThumbnailType.PREVIEW -> THUMBNAIL_TYPE_PREVIEW
                            }
                            dataPointer = nativeClient.getByteArrayPointer(data)
                            dataLength = data.size.toLong()
                        })
                    }
                }
            }
        }
    )

    fun free(handle: Long) {
        dispatch("free") {
            fileUploaderFree = fileUploaderFreeRequest { fileUploaderHandle = handle }
        }
        releaseAll()
    }
}
