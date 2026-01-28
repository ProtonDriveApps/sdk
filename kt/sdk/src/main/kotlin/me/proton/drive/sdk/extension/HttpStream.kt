package me.proton.drive.sdk.extension

import me.proton.drive.sdk.internal.HttpStream
import okhttp3.MediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import okio.BufferedSink
import proton.sdk.ProtonSdk.HttpRequest
import java.nio.ByteBuffer


internal suspend fun HttpStream.read(
    request: HttpRequest
): RequestBody {
    val buffer = Buffer()
    if (request.hasSdkContentHandle()) {
        val byteBuffer = ByteBuffer.allocateDirect(64 * 1024)

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


internal fun HttpStream.readAsStream(
    request: HttpRequest,
): RequestBody = StreamRequestBody(
    httpStream = this,
    request = request,
)

private class StreamRequestBody(
    private val httpStream: HttpStream,
    private val request: HttpRequest,
) : RequestBody() {
    override fun isOneShot(): Boolean = true

    override fun contentType(): MediaType? = null

    override fun contentLength(): Long = -1 // enables chunked mode

    override fun writeTo(sink: BufferedSink) {
        if (request.hasSdkContentHandle()) {
            val buffer = ByteBuffer.allocateDirect(64 * 1024)
            while (true) {
                buffer.clear()
                val bytesRead = httpStream.readBlocking(request.sdkContentHandle, buffer)
                if (bytesRead <= 0) break
                buffer.position(bytesRead)

                // Flip so we can read bytes from ByteBuffer
                buffer.flip()

                // Write directly from ByteBuffer to okio
                sink.write(buffer)
            }
        }
    }
}
