package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.JniUploader
import me.proton.drive.sdk.internal.toLogId
import java.io.InputStream
import java.nio.channels.Channels
import java.util.concurrent.atomic.AtomicReference

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
        log(INFO, "uploadFromStream")
        val channel = Channels.newChannel(inputStream)
        val coroutineScopeReference = AtomicReference(coroutineScope)
        val handle = bridge.uploadFromStream(
            uploaderHandle = handle,
            cancellationTokenSourceHandle = source.handle,
            thumbnails = thumbnails,
            onRead = channel::read,
            onProgress = { progressUpdate ->
                with(progressUpdate) {
                    log(DEBUG, "progress: $bytesCompleted/$bytesInTotal")
                    progress(bytesCompleted, bytesInTotal)
                }
            },
            coroutineScopeProvider = coroutineScopeReference::get,
        )
        UploadController(
            uploader = this@Uploader,
            handle = handle,
            bridge = JniUploadController(),
            cancellationTokenSource = source,
            inputStream = inputStream,
            coroutineScopeConsumer = coroutineScopeReference::set,
        )
    }

    override fun close() = bridge.free(handle)

    override suspend fun cancel() {
        log(INFO, "cancel")
        super.cancel()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "FileUploader(${handle.toLogId()}) $message")
    }
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
