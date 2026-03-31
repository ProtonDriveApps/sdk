package me.proton.drive.sdk

import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.SessionRenewRequest
import me.proton.drive.sdk.internal.InteropProtonDriveClient
import me.proton.drive.sdk.internal.InteropProtonPhotosClient
import me.proton.drive.sdk.internal.JniProtonDriveClient
import me.proton.drive.sdk.internal.JniProtonPhotosClient
import me.proton.drive.sdk.internal.JniSession
import me.proton.drive.sdk.internal.factory
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

suspend fun Session.protonDriveClientCreate(): ProtonDriveClient =
    factory(JniProtonDriveClient()) {
        InteropProtonDriveClient(
            session = this@protonDriveClientCreate,
            handle = createFromSession(sessionHandle = handle),
            bridge = this,
        )
    }

suspend fun Session.protonPhotosClientCreate(): ProtonPhotosClient =
    factory(JniProtonPhotosClient()) {
        val session = this@protonPhotosClientCreate
        InteropProtonPhotosClient(
            session = session,
            handle = createFromSession(sessionHandle = handle),
            bridge = this,
        )
    }
