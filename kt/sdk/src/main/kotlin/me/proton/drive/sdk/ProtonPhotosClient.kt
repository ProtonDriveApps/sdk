package me.proton.drive.sdk

import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.internal.JniProtonPhotosClient
import me.proton.drive.sdk.internal.toLogId

class ProtonPhotosClient internal constructor(
    internal val handle: Long,
    private val bridge: JniProtonPhotosClient,
    session: Session? = null,
) : SdkNode(session), AutoCloseable {

    override fun close() {
        log(DEBUG, "close")
        bridge.free(handle)
        super.close()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "ProtonPhotosClient(${handle.toLogId()}) $message")
    }
}

suspend fun Session.protonPhotosClientCreate(): ProtonPhotosClient = JniProtonPhotosClient().run {
    val session = this@protonPhotosClientCreate
    ProtonPhotosClient(
        session = session,
        handle = create(handle),
        bridge = this,
    )
}
