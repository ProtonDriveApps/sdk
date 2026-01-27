package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.UploadResult
import me.proton.drive.sdk.internal.CoroutineScopeConsumer
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.toLogId
import java.nio.channels.Channel

class CommonUploadController internal constructor(
    uploader: SdkNode,
    internal val handle: Long,
    private val bridge: JniUploadController,
    private val channel: Channel,
    private val coroutineScopeConsumer: CoroutineScopeConsumer,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(uploader), UploadController {

    val isPausedFlow = MutableStateFlow(false)

    private val _progressFlow = MutableStateFlow<ProgressUpdate?>(null)
    override val progressFlow = _progressFlow.asStateFlow()

    internal suspend fun emitProgress(progress: ProgressUpdate?) {
        _progressFlow.emit(progress)
    }

    override suspend fun awaitCompletion(): UploadResult {
        log(DEBUG, "await completion")
        return runCatching {
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

    override suspend fun isPaused() = bridge.isPaused(handle).also { paused ->
        log(DEBUG, "isPaused: $paused")
        isPausedFlow.emit(paused)
    }

    override suspend fun dispose() = bridge.dispose(handle)

    override fun close() {
        log(DEBUG, "close")
        channel.close()
        bridge.free(handle)
        super.close()
    }

    override suspend fun cancel() {
        log(INFO, "cancel")
        super.cancel()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "UploadController(${handle.toLogId()}) $message")
    }
}
