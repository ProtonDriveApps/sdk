package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.internal.JniDownloadController
import me.proton.drive.sdk.internal.JniDownloader
import me.proton.drive.sdk.internal.toLogId
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.channels.Channels

class Downloader internal constructor(
    client: DriveClient,
    internal val handle: Long,
    private val bridge: JniDownloader,
    override val cancellationTokenSource: CancellationTokenSource
) : SdkNode(client), AutoCloseable, Cancellable {

    suspend fun downloadToStream(
        coroutineScope: CoroutineScope,
        outputStream: OutputStream,
        progress: suspend (Long, Long) -> Unit = { _, _ -> },
    ): DownloadController = cancellationTokenSource().let { cancellationTokenSource ->
        log(INFO, "downloadToStream")
        val handle = bridge.downloadToStream(
            handle = handle,
            cancellationTokenSourceHandle = cancellationTokenSource.handle,
            onWrite = { byteBuffer: ByteBuffer ->
                Channels.newChannel(outputStream).write(byteBuffer)
            },
            onProgress = { progressUpdate ->
                with(progressUpdate) {
                    bridge.internalLogger(DEBUG, "progress: $bytesCompleted/$bytesInTotal")
                    progress(bytesCompleted, bytesInTotal)
                }
            },
            coroutineScope = coroutineScope,
        )
        DownloadController(
            downloader = this@Downloader,
            handle = handle,
            bridge = JniDownloadController(),
            cancellationTokenSource = cancellationTokenSource,
        )
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

suspend fun DriveClient.downloader(
    revisionUid: String
): Downloader = cancellationTokenSource().let { source ->
    val client = this@downloader
    JniDownloader().run {
        Downloader(
            client = client,
            handle = create(handle, source.handle, revisionUid),
            bridge = this,
            cancellationTokenSource = source,
        )
    }
}
