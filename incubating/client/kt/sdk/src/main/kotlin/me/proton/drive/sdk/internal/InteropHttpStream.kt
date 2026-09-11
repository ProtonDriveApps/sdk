package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.channels.ReadableByteChannel

internal class InteropHttpStream(
    private val bridge: JniHttpStream,
) : HttpStream {

    override suspend fun read(sdkContentHandle: Long, buffer: ByteBuffer): Int =
        withContext(Dispatchers.IO) {
            readOrThrow(sdkContentHandle, buffer)
        }

    // OkHttp only understands IOException; anything else surfaces as a fatal uncaught exception.
    @Suppress("TooGenericExceptionCaught")
    private suspend fun readOrThrow(sdkContentHandle: Long, buffer: ByteBuffer): Int = try {
        bridge.read(sdkContentHandle, buffer)
    } catch (error: CancellationException) {
        throw error
    } catch (error: IOException) {
        throw error
    } catch (error: Exception) {
        throw IOException("Failed to read from SDK stream", error)
    }

    override fun write(
        coroutineScope: CoroutineScope,
        channel: ReadableByteChannel,
        onDispose: suspend () -> Unit,
    ): Long = bridge.write(coroutineScope, channel, onDispose)

    override fun close() {
        bridge.release()
    }
}
