package me.proton.drive.sdk

import me.proton.drive.sdk.internal.JniCancellationTokenSource

class CancellationTokenSource internal constructor(
    internal val handle: Long,
    private val bridge: JniCancellationTokenSource
) : AutoCloseable {

    suspend fun cancel() = bridge.cancel(handle)

    override fun close() = bridge.free(handle)
}
