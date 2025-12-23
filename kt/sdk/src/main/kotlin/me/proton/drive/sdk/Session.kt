package me.proton.drive.sdk

import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.SessionRenewRequest
import me.proton.drive.sdk.internal.JniSession
import me.proton.drive.sdk.internal.toLogId

class Session internal constructor(
    internal val handle: Long,
    private val bridge: JniSession,
    override val cancellationTokenSource: CancellationTokenSource
) : SdkNode(null), AutoCloseable, Cancellable {

    suspend fun renew(
        request: SessionRenewRequest,
    ): Session {
        log(DEBUG, "end")
        return bridge.renew(handle, request).run {
            Session(this, bridge, cancellationTokenSource)
        }
    }

    suspend fun end() {
        log(INFO, "end")
        bridge.end(handle)
    }

    override fun close() {
        log(DEBUG, "close")
        bridge.free(handle)
        super.close()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "Session(${handle.toLogId()}) $message")
    }
}
