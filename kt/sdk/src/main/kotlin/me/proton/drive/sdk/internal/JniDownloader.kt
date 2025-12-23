package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.toLongResponse
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.downloadToStreamRequest
import proton.drive.sdk.driveClientGetFileDownloaderRequest
import proton.drive.sdk.fileDownloaderFreeRequest
import proton.drive.sdk.request
import java.nio.ByteBuffer

class JniDownloader internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun create(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
        revisionUid: String,
    ): Long = executeOnce("create", LongResponseCallback) {
        driveClientGetFileDownloader = driveClientGetFileDownloaderRequest {
            this.revisionUid = revisionUid
            this.clientHandle = clientHandle
            this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
        }
    }

    suspend fun downloadToStream(
        handle: Long,
        cancellationTokenSourceHandle: Long,
        onWrite: suspend (ByteBuffer) -> Unit,
        onProgress: suspend (ProtonDriveSdk.ProgressUpdate) -> Unit,
        coroutineScope: CoroutineScope
    ): Long = executePersistent(
        clientBuilder = { continuation ->
            ProtonDriveSdkNativeClient(
                method("downloadToStream"),
                continuation.toLongResponse(),
                write = onWrite,
                progress = onProgress,
                logger = internalLogger,
                coroutineScope = coroutineScope,
            )
        },
        requestBuilder = { client ->
            request {
                downloadToStream = downloadToStreamRequest {
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
            fileDownloaderFree = fileDownloaderFreeRequest { fileDownloaderHandle = handle }
        }
        releaseAll()
    }
}
