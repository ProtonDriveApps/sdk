package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.internal.JniDownloadController
import me.proton.drive.sdk.internal.JniFileDownloader
import me.proton.drive.sdk.internal.factory
import me.proton.drive.sdk.internal.toLogId
import java.nio.channels.WritableByteChannel
import java.util.concurrent.atomic.AtomicReference

class FileDownloader internal constructor(
    client: ProtonDriveClient,
    internal val handle: Long,
    private val bridge: JniFileDownloader,
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
            downloader = this@FileDownloader,
            handle = handle,
            bridge = JniDownloadController(),
            channel = channel,
            cancellationTokenSource = cancellationTokenSource,
            coroutineScopeConsumer = coroutineScopeReference::set,
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

suspend fun ProtonDriveClient.downloader(
    revisionUid: String
): Downloader = cancellationTokenSource().let { source ->
    factory(JniFileDownloader()){
        FileDownloader(
            client = this@downloader,
            handle = this.create(handle, source.handle, revisionUid),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}
