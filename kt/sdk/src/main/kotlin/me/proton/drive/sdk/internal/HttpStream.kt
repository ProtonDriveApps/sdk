package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import me.proton.drive.sdk.ProtonDriveSdkException
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.channels.ReadableByteChannel


class HttpStream internal constructor(
    private val bridge: JniHttpStream,
) : AutoCloseable {

    suspend fun read(sdkContentHandle: Long, buffer: ByteBuffer) = withContext(Dispatchers.IO) {
        readOrThrow(sdkContentHandle, buffer)
    }

    fun readBlocking(sdkContentHandle: Long, buffer: ByteBuffer) = runBlocking(Dispatchers.IO) {
        readOrThrow(sdkContentHandle, buffer)
    }

    private suspend fun readOrThrow(sdkContentHandle: Long, buffer: ByteBuffer): Int = try {
        bridge.read(sdkContentHandle, buffer)
    } catch (error: ProtonDriveSdkException) {
        throw IOException("Failed to read from SDK stream", error)
    }

    fun write(coroutineScope: CoroutineScope, channel: ReadableByteChannel): Long =
        bridge.write(coroutineScope, channel)

    override fun close() {
        bridge.release()
        bridge.releaseAll()
    }
}
