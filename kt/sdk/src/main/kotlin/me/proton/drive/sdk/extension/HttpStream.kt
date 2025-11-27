/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Drive.
 *
 * Proton Drive is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Drive is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Drive.  If not, see <https://www.gnu.org/licenses/>.
 */

package me.proton.drive.sdk.extension

import kotlinx.coroutines.runBlocking
import me.proton.drive.sdk.internal.HttpStream
import okhttp3.MediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import proton.sdk.ProtonSdk.HttpRequest
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.channels.Channels


internal suspend fun HttpStream.read(
    request: HttpRequest
): RequestBody {
    val outputStream = ByteArrayOutputStream()
    if (request.hasSdkContentHandle()) {
        val buffer = ByteBuffer.allocateDirect(64 * 1024)

        while (true) {
            buffer.clear()
            val bytesRead = read(request.sdkContentHandle, buffer)
            if (bytesRead <= 0) break
            buffer.position(bytesRead)

            // Flip so we can read bytes from ByteBuffer
            buffer.flip()

            // Write directly from ByteBuffer to okio
            Channels.newChannel(outputStream).write(buffer)
        }
    }

    val body = outputStream.toByteArray().toRequestBody()
    return body
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
            runBlocking {
                while (true) {
                    buffer.clear()
                    val bytesRead = httpStream.read(request.sdkContentHandle, buffer)
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
}
