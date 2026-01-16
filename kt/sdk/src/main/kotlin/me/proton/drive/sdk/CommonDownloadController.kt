package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.internal.CoroutineScopeConsumer
import me.proton.drive.sdk.internal.JniDownloadController
import me.proton.drive.sdk.internal.toLogId

class CommonDownloadController internal constructor(
    downloader: SdkNode,
    internal val handle: Long,
    private val bridge: JniDownloadController,
    private val coroutineScopeConsumer: CoroutineScopeConsumer,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(downloader), DownloadController {

    val isPausedFlow = MutableStateFlow(false)

    override suspend fun awaitCompletion() {
        log(DEBUG, "await completion")
        runCatching {
            isPaused()
            bridge.awaitCompletion(handle)
        }.onSuccess {
            log(INFO, "completed")
        }.onFailure {
            log(INFO, "cancelled or failed")
            isPaused()
        }.getOrThrow()
    }

    override suspend fun resume(coroutineScope: CoroutineScope) {
        log(INFO, "resume")
        coroutineScopeConsumer(coroutineScope)
        bridge.resume(handle).also { isPaused() }
    }

    override suspend fun pause() {
        log(INFO, "pause")
        bridge.pause(handle).also { isPaused() }
        coroutineScopeConsumer(null)
    }

    override suspend fun isPaused() = bridge.isPaused(handle)
        .also { isPausedFlow.emit(it) }

    override suspend fun isDownloadCompleteWithVerificationIssue(): Boolean {
        log(DEBUG, "isDownloadCompleteWithVerificationIssue")
        return bridge.isDownloadCompleteWithVerificationIssue(handle)
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
        bridge.clientLogger(level, "CommonDownloadController(${handle.toLogId()}) $message")
    }
}
