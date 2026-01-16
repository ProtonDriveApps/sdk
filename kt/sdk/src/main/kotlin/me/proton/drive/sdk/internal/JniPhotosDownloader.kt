package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.toLongResponse
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.drivePhotosClientDownloadToStreamRequest
import proton.drive.sdk.drivePhotosClientDownloaderFreeRequest
import proton.drive.sdk.drivePhotosClientGetPhotoDownloaderRequest
import proton.drive.sdk.request
import java.nio.ByteBuffer

class JniPhotosDownloader internal constructor() : JniBaseProtonDriveSdk() {
    suspend fun create(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
        photoUid: String,
    ): Long = executeOnce("create", LongResponseCallback) {
        drivePhotosClientGetPhotoDownloader = drivePhotosClientGetPhotoDownloaderRequest {
            this.photoUid = photoUid
            this.clientHandle = clientHandle
            this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
        }
    }

    suspend fun downloadToStream(
        handle: Long,
        cancellationTokenSourceHandle: Long,
        onWrite: suspend (ByteBuffer) -> Unit,
        onProgress: suspend (ProtonDriveSdk.ProgressUpdate) -> Unit,
        coroutineScopeProvider: CoroutineScopeProvider,
    ): Long = executePersistent(
        clientBuilder = { continuation ->
            ProtonDriveSdkNativeClient(
                method("downloadToStream"),
                continuation.toLongResponse(),
                write = onWrite,
                progress = onProgress,
                logger = internalLogger,
                coroutineScopeProvider = coroutineScopeProvider,
            )
        },
        requestBuilder = { client ->
            request {
                drivePhotosClientDownloadToStream = drivePhotosClientDownloadToStreamRequest {
                    this.downloaderHandle = handle
                    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
                    writeAction = ProtonDriveSdkNativeClient.getWritePointer()
                    progressAction = ProtonDriveSdkNativeClient.getProgressPointer()
                }
            }
        }
    )

    fun free(handle: Long) {
        dispatch("free") {
            drivePhotosClientDownloaderFree = drivePhotosClientDownloaderFreeRequest {
                fileDownloaderHandle = handle
            }
        }
        releaseAll()
    }
}
