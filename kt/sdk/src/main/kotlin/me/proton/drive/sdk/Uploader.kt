package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.JniUploader
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.channels.Channels

class Uploader internal constructor(
    client: DriveClient,
    internal val handle: Long,
    private val bridge: JniUploader,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(client), AutoCloseable, Cancellable {

    suspend fun uploadFromStream(
        coroutineScope: CoroutineScope,
        inputStream: InputStream,
        thumbnails: Map<ThumbnailType, ByteArray> = emptyMap(),
        progress: suspend (Long, Long) -> Unit = { _, _ -> },
    ): UploadController = cancellationTokenSource().let { source ->
        val handle = bridge.uploadFromStream(
            uploaderHandle = handle,
            cancellationTokenSourceHandle = source.handle,
            thumbnails = thumbnails,
            onRead = { buffer: ByteBuffer ->
                Channels.newChannel(inputStream).read(buffer)
            },
            onProgress = { progressUpdate ->
                with(progressUpdate) {
                    progress(bytesCompleted, bytesInTotal)
                }
            },
            coroutineScope = coroutineScope
        )
        UploadController(
            uploader = this@Uploader,
            handle = handle,
            bridge = JniUploadController(),
            cancellationTokenSource = source,
            inputStream = inputStream,
        )
    }

    override fun close() = bridge.free(handle)
}

suspend fun DriveClient.uploader(
    request: FileUploaderRequest
): Uploader = cancellationTokenSource().let { source ->
    val client = this
    JniUploader().run {
        Uploader(
            client = client,
            handle = getFile(client.handle, source.handle, request),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}

suspend fun DriveClient.uploader(
    request: FileRevisionUploaderRequest
): Uploader = cancellationTokenSource().let { source ->
    val client = this@uploader
    JniUploader().run {
        Uploader(
            client = client,
            handle = getFileRevision(handle, source.handle, request),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}
