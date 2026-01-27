package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.JniFileUploader
import me.proton.drive.sdk.internal.toLogId
import java.nio.channels.ReadableByteChannel
import java.util.concurrent.atomic.AtomicReference

class FileUploader internal constructor(
    client: ProtonDriveClient,
    internal val handle: Long,
    private val bridge: JniFileUploader,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(client), Uploader {

    override suspend fun uploadFromStream(
        coroutineScope: CoroutineScope,
        channel: ReadableByteChannel,
        thumbnails: Map<ThumbnailType, ByteArray>,
    ): UploadController = cancellationTokenSource().let { source ->
        log(INFO, "uploadFromStream")
        val coroutineScopeReference = AtomicReference(coroutineScope)
        val controllerReference = AtomicReference<CommonUploadController>()
        val handle = bridge.uploadFromStream(
            uploaderHandle = handle,
            cancellationTokenSourceHandle = source.handle,
            thumbnails = thumbnails,
            onRead = channel::read,
            onProgress = { progressUpdate ->
                with(progressUpdate) {
                    log(DEBUG, "progress: $bytesCompleted/$bytesInTotal")
                    controllerReference.get()?.emitProgress(toEntity())
                }
            },
            coroutineScopeProvider = coroutineScopeReference::get,
        )
        CommonUploadController(
            uploader = this@FileUploader,
            handle = handle,
            bridge = JniUploadController(),
            cancellationTokenSource = source,
            channel = channel,
            coroutineScopeConsumer = coroutineScopeReference::set,
        ).also(controllerReference::set)
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

suspend fun ProtonDriveClient.uploader(
    request: FileUploaderRequest
): Uploader = cancellationTokenSource().let { source ->
    val client = this
    JniFileUploader().run {
        FileUploader(
            client = client,
            handle = getFile(client.handle, source.handle, request),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}

suspend fun ProtonDriveClient.uploader(
    request: FileRevisionUploaderRequest
): Uploader = cancellationTokenSource().let { source ->
    val client = this@uploader
    JniFileUploader().run {
        FileUploader(
            client = client,
            handle = getFileRevision(handle, source.handle, request),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}
