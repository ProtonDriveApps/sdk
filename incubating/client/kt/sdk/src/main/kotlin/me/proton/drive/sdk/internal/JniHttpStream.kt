package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.extension.toIntResponse
import proton.drive.sdk.request
import proton.drive.sdk.streamReadRequest
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.channels.ReadableByteChannel

class JniHttpStream internal constructor(
) : JniBaseProtonDriveSdk() {

    private var client: ProtonDriveSdkNativeClient<*>? = null

    // releaseAll() only closes the queue on the consumer thread, too late for a read racing it.
    @Volatile
    private var released = false

    fun write(
        coroutineScope: CoroutineScope,
        channel: ReadableByteChannel,
        onDispose: suspend () -> Unit,
    ): Long {
        return ProtonDriveSdkNativeClient<Nothing>(
            name = method("write"),
            readHttpBody = { buffer -> channel.read(buffer) },
            dispose = {
                channel.close()
                onDispose()
            },
            coroutineScopeProvider = { coroutineScope },
            logger = internalLogger
        ).also {
            client = it
        }.asWeakReference()
    }

    suspend fun read(
        handle: Long,
        buffer: ByteBuffer,
    ): Int {
        // A cancelled request releases the stream while OkHttp may still be pulling the body.
        if (released) throw IOException("HTTP stream was released")
        return executeOnce(
            name = "read",
            clientBuilder = { continuation, asClientResponseCallback ->
                ProtonDriveSdkNativeClient(
                    name = method("read"),
                    response = continuation.toIntResponse().asClientResponseCallback(),
                    logger = internalLogger,
                )
            },
            requestBuilder = { _ ->
                request {
                    streamRead = streamReadRequest {
                        streamHandle = handle
                        bufferPointer = JniBuffer.getBufferPointer(buffer)
                        bufferLength = JniBuffer.getBufferSize(buffer).toInt()
                    }
                }
            }
        )
    }

    fun release() {
        released = true
        client?.release()
        client = null
        releaseAll()
    }

}
