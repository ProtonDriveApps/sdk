package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.entity.PhotosUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.internal.JniPhotosUploader
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.toLogId
import java.io.InputStream
import java.nio.channels.Channels
import java.nio.channels.ReadableByteChannel
import java.util.concurrent.atomic.AtomicReference

class PhotosUploader(
    client: ProtonPhotosClient,
    internal val handle: Long,
    private val bridge: JniPhotosUploader,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(client), Uploader {

    override suspend fun uploadFromStream(
        coroutineScope: CoroutineScope,
        channel: ReadableByteChannel,
        thumbnails: Map<ThumbnailType, ByteArray>,
        progress: suspend (Long, Long) -> Unit
    ): UploadController =
        cancellationTokenSource().let { source ->
            log(INFO, "uploadFromStream")
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
            CommonUploadController(
                uploader = this@PhotosUploader,
                handle = handle,
                bridge = JniUploadController(),
                cancellationTokenSource = source,
                channel = channel,
                coroutineScopeConsumer = coroutineScopeReference::set,
            )
        }

    override fun close() = bridge.free(handle)

    override suspend fun cancel() {
        log(INFO, "cancel")
        super.cancel()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "PhotosUploader(${handle.toLogId()}) $message")
    }
}

suspend fun ProtonPhotosClient.uploader(
    request: PhotosUploaderRequest
): Uploader = cancellationTokenSource().let { source ->
    val client = this
    JniPhotosUploader().run {
        PhotosUploader(
            client = client,
            handle = getPhoto(client.handle, source.handle, request),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}
