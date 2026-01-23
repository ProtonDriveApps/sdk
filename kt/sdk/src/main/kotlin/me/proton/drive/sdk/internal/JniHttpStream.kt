package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.extension.toIntResponse
import proton.sdk.request
import proton.sdk.streamReadRequest
import java.nio.ByteBuffer
import java.nio.channels.ReadableByteChannel

class JniHttpStream internal constructor(
) : JniBaseProtonSdk() {

    private var client: ProtonDriveSdkNativeClient? = null

    internal var onBodyRead: (suspend () -> Unit)? = null

    fun write(
        coroutineScope: CoroutineScope,
        channel: ReadableByteChannel,
    ): Long {
        return ProtonDriveSdkNativeClient(
            name = method("write"),
            readHttpBody = { buffer ->
                channel.read(buffer).also { numberOfByteRead ->
                    if (numberOfByteRead == -1) {
                        channel.close()
                        onBodyRead?.invoke()
                    }
                }
            },
            coroutineScopeProvider = { coroutineScope },
            logger = internalLogger
        ).also {
            client = it
        }.createWeakRef()
    }

    suspend fun read(
        handle: Long,
        buffer: ByteBuffer,
    ): Int = executeOnce(
        clientBuilder = { continuation, asClientResponseCallback ->
            ProtonSdkNativeClient(
                name = method("read"),
                response = continuation.toIntResponse().asClientResponseCallback(),
                logger = internalLogger,
            )
        },
        requestBuilder = { client ->
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
        client = null
    }

}
