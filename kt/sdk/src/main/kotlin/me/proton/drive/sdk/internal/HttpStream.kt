package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import java.io.InputStream
import java.nio.ByteBuffer


class HttpStream internal constructor(
    private val bridge: JniHttpStream,
) : AutoCloseable {

    suspend fun read(sdkContentHandle: Long, buffer: ByteBuffer) =
        bridge.read(sdkContentHandle, buffer)

    fun write(coroutineScope: CoroutineScope, inputStream: InputStream): Long =
        bridge.write(coroutineScope, inputStream)

    override fun close() {
        bridge.release()
        bridge.releaseAll()
    }
}
