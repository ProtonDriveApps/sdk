package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.withTimeout
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toPercentageString
import me.proton.drive.sdk.internal.JniFileUploader
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.cancellationCoroutineScope
import me.proton.drive.sdk.internal.toLogId
import java.nio.channels.ReadableByteChannel
import java.util.concurrent.atomic.AtomicReference
import kotlin.time.Duration

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
        sha1Provider: (() -> ByteArray)?,
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
                    log(DEBUG, "progress: ${progressUpdate.toPercentageString()}")
                    controllerReference.get()?.emitProgress(toEntity())
                }
            },
            sha1Provider = sha1Provider,
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
    request: FileUploaderRequest,
    timeout: Duration,
): Uploader = withTimeout(timeout) {
    cancellationCoroutineScope { source ->
        JniFileUploader().run {
            FileUploader(
                client = this@uploader,
                handle = getFileUploader(
                    clientHandle = handle,
                    cancellationTokenSourceHandle = source.handle,
                    request = request
                ),
                bridge = this,
                cancellationTokenSource = source,
            )
        }
    }
}

suspend fun ProtonDriveClient.uploader(
    request: FileRevisionUploaderRequest,
    timeout: Duration,
): Uploader = withTimeout(timeout) {
    cancellationCoroutineScope { source ->
        JniFileUploader().run {
            FileUploader(
                client = this@uploader,
                handle = getFileRevisionUploader(
                    clientHandle = handle,
                    cancellationTokenSourceHandle = source.handle,
                    request = request
                ),
                bridge = this,
                cancellationTokenSource = source,
            )
        }
    }
}
