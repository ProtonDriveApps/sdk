package me.proton.drive.sdk

import me.proton.drive.sdk.entity.SessionRenewRequest
import me.proton.drive.sdk.internal.JniSession

class Session internal constructor(
    internal val handle: Long,
    private val bridge: JniSession,
    override val cancellationTokenSource: CancellationTokenSource
) : SdkNode(null), AutoCloseable, Cancellable {

    suspend fun renew(
        request: SessionRenewRequest,
    ): Session = bridge.renew(handle, request).run {
        Session(this, bridge, cancellationTokenSource)
    }

    suspend fun end() = bridge.end(handle)

    override fun close() {
        bridge.free(handle)
        super.close()
    }
}
