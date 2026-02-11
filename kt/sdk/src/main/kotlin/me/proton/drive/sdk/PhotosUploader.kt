package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.entity.PhotosUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.internal.JniPhotosUploader
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.toLogId
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
                    log(DEBUG, "progress: $bytesCompleted/$bytesInTotal")
                    controllerReference.get()?.emitProgress(toEntity())
                }
            },
            sha1Provider = sha1Provider,
            coroutineScopeProvider = coroutineScopeReference::get,
        )
        CommonUploadController(
            uploader = this@PhotosUploader,
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
        bridge.clientLogger(level, "PhotosUploader(${handle.toLogId()}) $message")
    }
}

suspend fun ProtonPhotosClient.uploader(
    request: PhotosUploaderRequest
): Uploader = cancellationTokenSource().let { source ->
    JniPhotosUploader().run {
        PhotosUploader(
            client = this@uploader,
            handle = getPhotoUploader(
                clientHandle = handle,
                cancellationTokenSourceHandle = source.handle,
                request = request,
            ),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}
