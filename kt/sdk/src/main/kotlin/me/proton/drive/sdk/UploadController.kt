package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.UploadResult
import me.proton.drive.sdk.internal.CoroutineScopeConsumer
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.toLogId
import java.io.InputStream

class UploadController internal constructor(
    uploader: Uploader,
    internal val handle: Long,
    private val bridge: JniUploadController,
    private val inputStream: InputStream,
    private val coroutineScopeConsumer: CoroutineScopeConsumer,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(uploader), AutoCloseable, Cancellable {

    val isPausedFlow = MutableStateFlow(false)

    suspend fun awaitCompletion(): UploadResult {
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

    suspend fun resume(coroutineScope: CoroutineScope) {
        log(INFO, "resume")
        coroutineScopeConsumer(coroutineScope)
        bridge.resume(handle).also { isPaused() }
    }

    suspend fun pause() {
        log(INFO, "pause")
        bridge.pause(handle).also { isPaused() }
        coroutineScopeConsumer(null)
    }

    suspend fun isPaused() = bridge.isPaused(handle)
        .also { isPausedFlow.emit(it) }

    suspend fun dispose() = bridge.dispose(handle)

    override fun close() {
        log(DEBUG, "close")
        inputStream.close()
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
