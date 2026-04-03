package me.proton.drive.sdk

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.UploadResult
import me.proton.drive.sdk.internal.CoroutineScopeConsumer
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.toLogId
import java.nio.channels.Channel
import kotlin.time.Duration.Companion.milliseconds

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
        }.recoverCatching { error ->
            if (error is CancellationException) {
                log(INFO, "interrupted, will pause")
                withContext(NonCancellable) {
                    pause()
                }
                throw error
            }
            if (isPaused()) {
                log(INFO, "paused")
                throw error
            }
            log(INFO, "aborted")
            throw UploadAbortedException(error)
        }.getOrThrow()
    }

    override suspend fun tryResume(coroutineScope: CoroutineScope): Boolean {
        log(DEBUG, "tryResume")
        coroutineScopeConsumer(coroutineScope)
        if (!isPaused()) {
            return false
        }
        log(INFO, "resume")
        bridge.resume(handle).also { isPaused() }
        return true
    }

    override suspend fun pause() {
        log(INFO, "pause")
        bridge.pause(handle).also { isPaused() }
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
        runCatching {
            withTimeout(500.milliseconds) { awaitCompletion() }
        }.recoverCatching { error ->
            if (error is TimeoutCancellationException) {
                log(DEBUG, "Stop waiting for completion: ${error.message}")
            } else if (error is CancellationException) {
                throw error
            }
            log(DEBUG, "Error during waiting for completion: ${error.message}")
        }
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "CommonUploadController(${handle.toLogId()}) $message")
    }
}
