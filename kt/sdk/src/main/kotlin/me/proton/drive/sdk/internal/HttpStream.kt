package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import java.nio.ByteBuffer
import java.nio.channels.ReadableByteChannel


class HttpStream internal constructor(
    private val bridge: JniHttpStream,
) : AutoCloseable {

    suspend fun read(sdkContentHandle: Long, buffer: ByteBuffer) =
        bridge.read(sdkContentHandle, buffer)

    fun write(coroutineScope: CoroutineScope, channel: ReadableByteChannel): Long =
        bridge.write(coroutineScope, channel)

    override fun close() {
        bridge.release()
        bridge.releaseAll()
    }
}
