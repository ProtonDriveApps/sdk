package me.proton.drive.sdk.internal

import me.proton.drive.sdk.entity.PhotosUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.toLongResponse
import me.proton.drive.sdk.extension.toProtobuf
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_PREVIEW
import proton.drive.sdk.ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_THUMBNAIL
import proton.drive.sdk.drivePhotosClientUploadFromStreamRequest
import proton.drive.sdk.drivePhotosClientUploaderFreeRequest
import proton.drive.sdk.request
import proton.drive.sdk.thumbnail
import java.nio.ByteBuffer
import kotlin.collections.component1
import kotlin.collections.component2
import kotlin.collections.forEach

class JniPhotosUploader internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun getPhotoUploader(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
        request: PhotosUploaderRequest,
    ): Long = executeOnce("getPhoto", LongResponseCallback) {
        drivePhotosClientGetPhotoUploader =
            request.toProtobuf(clientHandle, cancellationTokenSourceHandle)
    }

    suspend fun uploadFromStream(
        uploaderHandle: Long,
        cancellationTokenSourceHandle: Long,
        thumbnails: Map<ThumbnailType, ByteArray>,
        onRead: (ByteBuffer) -> Int,
        onProgress: suspend (ProtonDriveSdk.ProgressUpdate) -> Unit,
        sha1Provider: (() -> ByteArray)?,
        coroutineScopeProvider: CoroutineScopeProvider,
    ): Long = executePersistent(
        clientBuilder = { continuation ->
            ProtonDriveSdkNativeClient(
                name = method("uploadFromStream"),
                response = continuation.toLongResponse().asClientResponseCallback(),
                read = onRead,
                progress = onProgress,
                sha1Provider = sha1Provider ?: { error("sha1Provider not configured for uploadFromStream") },
                logger = internalLogger,
                coroutineScopeProvider = coroutineScopeProvider,
            )
        },
        requestBuilder = { nativeClient ->
            request {
                drivePhotosClientUploadFromStream = drivePhotosClientUploadFromStreamRequest {
                    this.uploaderHandle = uploaderHandle
                    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
                    readAction = ProtonDriveSdkNativeClient.getReadPointer()
                    progressAction = ProtonDriveSdkNativeClient.getProgressPointer()
                    if (sha1Provider != null) {
                        sha1Function = ProtonDriveSdkNativeClient.getSha1Pointer()
                    }
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
/*
    suspend fun findDuplicates(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
    ): Long = executeOnce("findDuplicates", LongResponseCallback) {
        drivePhotosClientFindDuplicates = drivePhotosClientFindDuplicatesRequest {
            this.name = ""
            this.clientHandle = clientHandle
            this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
            this.generateSha1Function =
        }
    }
*/
    fun free(handle: Long) {
        dispatch("free") {
            drivePhotosClientUploaderFree =
                drivePhotosClientUploaderFreeRequest { fileUploaderHandle = handle }
        }
        releaseAll()
    }
}
