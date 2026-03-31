package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.extension.seek
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toPercentageString
import me.proton.drive.sdk.internal.JniDownloadController
import me.proton.drive.sdk.internal.JniFileDownloader
import me.proton.drive.sdk.internal.toLogId
import java.nio.channels.SeekableByteChannel
import java.nio.channels.WritableByteChannel
import java.util.concurrent.atomic.AtomicReference

class FileDownloader internal constructor(
    client: SdkNode,
    internal val handle: Long,
    private val bridge: JniFileDownloader,
    override val cancellationTokenSource: CancellationTokenSource
) : SdkNode(client), Downloader {

    override suspend fun downloadToStream(
        coroutineScope: CoroutineScope,
        channel: WritableByteChannel,
    ): DownloadController = cancellationTokenSource().let { source ->
        log(INFO, "downloadToStream")
        val coroutineScopeReference = AtomicReference(coroutineScope)
        val controllerReference = AtomicReference<CommonDownloadController>()
        val handle = bridge.downloadToStream(
            handle = handle,
            cancellationTokenSourceHandle = source.handle,
            onWrite = channel::write,
            onSeek = if (channel is SeekableByteChannel) {
                channel::seek
            } else {
                null
            },
            onProgress = { progressUpdate ->
                with(progressUpdate) {
                    bridge.internalLogger(DEBUG, "progress: ${progressUpdate.toPercentageString()}")
                    controllerReference.get()?.emitProgress(toEntity())
                }
            },
            coroutineScopeProvider = coroutineScopeReference::get,
        )
        CommonDownloadController(
            downloader = this@FileDownloader,
            handle = handle,
            bridge = JniDownloadController(),
            channel = channel,
            coroutineScopeConsumer = coroutineScopeReference::set,
            cancellationTokenSource = source,
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
        bridge.clientLogger(level, "FileDownloader(${handle.toLogId()}) $message")
    }
}

