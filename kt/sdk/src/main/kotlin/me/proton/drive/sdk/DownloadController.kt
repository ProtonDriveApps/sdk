package me.proton.drive.sdk

import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.LoggerProvider.Level.WARN
import me.proton.drive.sdk.internal.JniDownloadController
import me.proton.drive.sdk.internal.toLogId

class DownloadController internal constructor(
    downloader: Downloader,
    internal val handle: Long,
    private val bridge: JniDownloadController,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(downloader), AutoCloseable, Cancellable {

    suspend fun awaitCompletion() {
        log(DEBUG, "await completion")
        runCatching {
            bridge.awaitCompletion(handle)
        }.onSuccess { log(INFO, "completed") }
            .onFailure { log(INFO, "cancelled or failed") }
            .getOrThrow()
    }

    suspend fun resume() {
        log(INFO, "resume")
        bridge.resume(handle)
    }

    suspend fun pause() {
        log(INFO, "pause")
        bridge.pause(handle)
    }

    suspend fun isDownloadCompleteWithVerificationIssue(): Boolean {
        log(DEBUG, "isDownloadCompleteWithVerificationIssue")
        return bridge.isDownloadCompleteWithVerificationIssue(handle)
    }

    override fun close() {
        log(DEBUG, "close")
        bridge.free(handle)
    }

    override suspend fun cancel() {
        log(INFO, "cancel")
        super.cancel()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "DownloadController(${handle.toLogId()}) $message")
    }
}
