package me.proton.drive.sdk

import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.LoggerProvider.Level.WARN
import me.proton.drive.sdk.entity.UploadResult
import me.proton.drive.sdk.internal.JniUploadController
import me.proton.drive.sdk.internal.toLogId
import java.io.InputStream

class UploadController internal constructor(
    uploader: Uploader,
    internal val handle: Long,
    private val bridge: JniUploadController,
    private val inputStream: InputStream,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(uploader), AutoCloseable, Cancellable {

    suspend fun awaitCompletion(): UploadResult {
        log(DEBUG, "await completion")
        return runCatching {
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
