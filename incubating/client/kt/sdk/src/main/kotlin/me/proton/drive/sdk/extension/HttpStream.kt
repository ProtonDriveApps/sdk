package me.proton.drive.sdk.extension

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.launch
import me.proton.drive.sdk.internal.HttpStream
import okhttp3.MediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import okio.BufferedSink
import okio.Pipe
import okio.buffer
import proton.drive.sdk.ProtonDriveSdk.HttpRequest
import java.io.IOException
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

private const val CHUNK_SIZE = 64 * 1024
private const val PIPE_SIZE = 256L * 1024

internal suspend fun HttpStream.read(
    request: HttpRequest
): RequestBody {
    val buffer = Buffer()
    if (request.hasSdkContentHandle()) {
        val byteBuffer = ByteBuffer.allocateDirect(CHUNK_SIZE)

        while (true) {
            byteBuffer.clear()
            val bytesRead = read(request.sdkContentHandle, byteBuffer)
            if (bytesRead <= 0) break
            byteBuffer.position(bytesRead)

            // Flip so we can read bytes from ByteBuffer
            byteBuffer.flip()

            // Write directly from ByteBuffer to okio Buffer
            buffer.write(byteBuffer)
        }
    }

    return buffer.snapshot().toRequestBody()
}


internal suspend fun HttpStream.readAsStream(
    request: HttpRequest,
): StreamingRequestBody? = if (request.hasSdkContentHandle()) {
    streamingRequestBody(request.sdkContentHandle, ::read)
} else {
    null
}

internal suspend fun streamingRequestBody(
    sdkContentHandle: Long,
    read: suspend (Long, ByteBuffer) -> Int,
): StreamingRequestBody {
    val pipe = Pipe(PIPE_SIZE)
    val failure = AtomicReference<Throwable?>()
    val producer = CoroutineScope(currentCoroutineContext()).launch(
        context = Dispatchers.IO,
        start = CoroutineStart.LAZY,
    ) {
        pipe.fillFrom(sdkContentHandle, read, failure)
    }
    return StreamingRequestBody(pipe, producer, failure)
}

@Suppress("TooGenericExceptionCaught")
private suspend fun Pipe.fillFrom(
    sdkContentHandle: Long,
    read: suspend (Long, ByteBuffer) -> Int,
    failure: AtomicReference<Throwable?>,
) {
    val out = sink.buffer()
    try {
        val byteBuffer = ByteBuffer.allocateDirect(CHUNK_SIZE)
        while (true) {
            byteBuffer.clear()
            val bytesRead = read(sdkContentHandle, byteBuffer)
            if (bytesRead <= 0) break
            byteBuffer.position(bytesRead)
            byteBuffer.flip()
            out.write(byteBuffer)
        }
        // Only a complete body may close the sink: an early close reads as end of input.
        out.close()
    } catch (error: CancellationException) {
        failure.set(error)
        cancel()
        throw error
    } catch (error: Exception) {
        // Must never fail upwards: the scope is shared by everything the client does.
        failure.set(error)
        cancel()
    }
}

internal class StreamingRequestBody(
    private val pipe: Pipe,
    private val producer: Job,
    private val failure: AtomicReference<Throwable?>,
) : RequestBody() {
    private val written = AtomicBoolean(false)

    init {
        // A producer cancelled before it starts never reaches fillFrom, leaving the consumer parked.
        producer.invokeOnCompletion { cause -> if (cause != null) pipe.cancel() }
    }

    override fun isOneShot(): Boolean = true

    override fun contentType(): MediaType? = null

    override fun contentLength(): Long = -1 // enables chunked mode

    override fun writeTo(sink: BufferedSink) {
        // Core resends the same call after a token refresh, but the stream is already drained.
        if (written.getAndSet(true)) throw IOException("Stream body cannot be resent")
        producer.start()
        val bytesWritten = try {
            sink.writeAll(pipe.source)
        } catch (error: IOException) {
            cancel()
            throw sdkFailure()?.apply {
                addSuppressed(error)
            } ?: error
        }
        sdkFailure()?.let { error -> throw error }
        // An upload block always carries content, so nothing read means the stream was drained.
        if (bytesWritten == 0L) throw IOException("SDK stream produced no content")
    }

    private fun sdkFailure(): IOException? =
        failure.get()?.let { error -> IOException("Failed to read from SDK stream", error) }

    // Coroutine cancellation cannot interrupt a producer blocked writing into a full pipe.
    fun cancel() {
        pipe.cancel()
        producer.cancel()
    }
}
