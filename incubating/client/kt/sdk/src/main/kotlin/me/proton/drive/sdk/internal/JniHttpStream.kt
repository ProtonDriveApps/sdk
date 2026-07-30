package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.extension.toIntResponse
import proton.drive.sdk.request
import proton.drive.sdk.streamReadRequest
import java.nio.ByteBuffer
import java.nio.channels.ReadableByteChannel

class JniHttpStream internal constructor(
) : JniBaseProtonDriveSdk() {

    private var client: ProtonDriveSdkNativeClient<*>? = null

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
    ): Int = executeOnce(
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

    fun release() {
        client?.release()
        client = null
    }

}
