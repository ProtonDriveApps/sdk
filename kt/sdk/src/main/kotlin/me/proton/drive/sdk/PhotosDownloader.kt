package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.internal.JniDownloadController
import me.proton.drive.sdk.internal.JniPhotosDownloader
import me.proton.drive.sdk.internal.factory
import me.proton.drive.sdk.internal.toLogId
import java.nio.channels.WritableByteChannel
import java.util.concurrent.atomic.AtomicReference

class PhotosDownloader internal constructor(
    client: ProtonPhotosClient,
    internal val handle: Long,
    private val bridge: JniPhotosDownloader,
    override val cancellationTokenSource: CancellationTokenSource
) : SdkNode(client), Downloader {

    override suspend fun downloadToStream(
        coroutineScope: CoroutineScope,
        channel: WritableByteChannel,
    ): DownloadController = cancellationTokenSource().let { cancellationTokenSource ->
        log(INFO, "downloadToStream")
        val coroutineScopeReference = AtomicReference(coroutineScope)
        val controllerReference = AtomicReference<CommonDownloadController>()
        val handle = bridge.downloadToStream(
            handle = handle,
            cancellationTokenSourceHandle = cancellationTokenSource.handle,
            onWrite = channel::write,
            onProgress = { progressUpdate ->
                with(progressUpdate) {
                    bridge.internalLogger(DEBUG, "progress: $bytesCompleted/$bytesInTotal")
                    controllerReference.get()?.emitProgress(toEntity())
                }
            },
            coroutineScopeProvider = coroutineScopeReference::get,
        )
        CommonDownloadController(
            downloader = this@PhotosDownloader,
            handle = handle,
            bridge = JniDownloadController(),
            channel = channel,
            coroutineScopeConsumer = coroutineScopeReference::set,
            cancellationTokenSource = cancellationTokenSource,
        ).also(controllerReference::set)
    }

    override fun close() {
        log(DEBUG, "close")
        bridge.free(handle)
        super.close()
    }

    override suspend fun cancel() {
        log(INFO, "cancel")
        super.cancel()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "PhotosDownloader(${handle.toLogId()}) $message")
    }
}

suspend fun ProtonPhotosClient.downloader(
    photoUid: String
): Downloader = cancellationTokenSource().let { source ->
    factory(JniPhotosDownloader()) {
        PhotosDownloader(
            client = this@downloader,
            handle = create(
                clientHandle = handle,
                cancellationTokenSourceHandle = source.handle,
                photoUid = photoUid,
            ),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}
