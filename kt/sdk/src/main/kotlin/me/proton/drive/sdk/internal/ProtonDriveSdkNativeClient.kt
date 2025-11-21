/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Core.
 *
 * Proton Core is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Core is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Core.  If not, see <https://www.gnu.org/licenses/>.
 */

package me.proton.drive.sdk.internal

import com.google.protobuf.Any
import com.google.protobuf.Int32Value
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import me.proton.drive.sdk.extension.asAny
import me.proton.drive.sdk.extension.toProtonSdkError
import proton.drive.sdk.ProtonDriveSdk
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.HttpResponse
import proton.sdk.ProtonSdk.Response
import proton.sdk.response
import java.nio.ByteBuffer

class ProtonDriveSdkNativeClient internal constructor(
    val name: String,
    val response: ResponseCallback = { error("response not configured for $name") },
    val read: suspend (ByteBuffer) -> Int = { error("read not configured for $name") },
    val write: suspend (ByteBuffer) -> Unit = { error("write not configured for $name") },
    val sendHttpRequest: suspend (ProtonSdk.HttpRequest) -> HttpResponse = { error("sendHttpRequest not configured for $name") },
    val request: suspend (ProtonDriveSdk.AccountRequest) -> Any = { error("request not configured for $name") },
    val progress: suspend (ProtonDriveSdk.ProgressUpdate) -> Unit = { error("progress not configured for $name") },
    val recordMetric: suspend (ProtonSdk.MetricEvent) -> Unit = { error("recordMetric not configured for $name") },
    val logger: (String) -> Unit = {},
    private val coroutineScope: CoroutineScope? = null,
) {

    private var pointers = emptyList<Long>()

    fun release() {
        pointers.forEach { pointer ->
            releaseByteArray(pointer)
        }
    }

    fun handleRequest(
        request: ProtonDriveSdk.Request,
    ) {
        logger("handle request ${request.payloadCase.name} for $name")
        handleRequest(request.toByteArray())
    }

    external fun handleRequest(
        request: ByteArray,
    )

    fun handleResponse(
        sdkHandle: Long,
        response: Response,
    ) {
        if (response.hasValue()) {
            logger("handle response value: ${response.value.typeUrl} for $name")
        } else {
            logger("handle response ${response.resultCase.name} for $name")
            if (response.resultCase == Response.ResultCase.ERROR) {
                logger(response.error.context)
            }
        }
        handleResponse(sdkHandle, response.toByteArray())
    }

    external fun handleResponse(
        sdkHandle: Long,
        response: ByteArray,
    )

    fun getByteArrayPointer(data: ByteArray): Long = getByteArray(data).also { pointer ->
        pointers += pointer
    }

    external fun getByteArray(data: ByteArray): Long
    external fun releaseByteArray(pointer: Long)

    external fun getReadPointer(): Long
    external fun getWritePointer(): Long
    external fun getProgressPointer(): Long
    external fun getSendHttpRequestPointer(): Long
    external fun getRequestPointer(): Long
    external fun getRecordMetricPointer(): Long

    @Suppress("unused") // Called by JNI
    fun onResponse(data: ByteBuffer) {
        logger("response for $name of size: ${data.capacity()}")
        response(data)
    }

    @Suppress("unused") // Called by JNI
    fun onProgress(data: ByteBuffer) = onCallback("progress") {
        logger("progress for $name of size: ${data.capacity()}")
        progress(ProtonDriveSdk.ProgressUpdate.parseFrom(data))
    }

    @Suppress("unused") // Called by JNI
    fun onRead(buffer: ByteBuffer, sdkHandle: Long) = onOperation("read", sdkHandle) {
        logger("read for $name of size: ${buffer.capacity()}")
        val bytesRead = read(buffer).takeUnless { it < 0 } ?: 0
        logger("$bytesRead bytes read for $name")
        response { value = Int32Value.of(bytesRead).asAny("google.protobuf.Int32Value") }
    }

    @Suppress("unused") // Called by JNI
    fun onWrite(data: ByteBuffer, sdkHandle: Long) = onOperation("write", sdkHandle) {
        logger("write for $name of size: ${data.capacity()}")
        write(data)
        response {}
    }

    @Suppress("unused") // Called by JNI
    fun onSendHttpRequest(data: ByteBuffer, sdkHandle: Long) = onOperation("http", sdkHandle) {
        val httpRequest = ProtonSdk.HttpRequest.parseFrom(data)
        logger("send http request for ${httpRequest.method} ${httpRequest.url} of size: ${data.capacity()}")
        val httpResponse = sendHttpRequest(httpRequest)
        logger("receive http response ${httpResponse.statusCode} for ${httpRequest.method} ${httpRequest.url}")
        response { value = httpResponse.asAny("proton.sdk.HttpResponse") }
    }

    @Suppress("unused") // Called by JNI
    fun onRequest(data: ByteBuffer, sdkHandle: Long) = onOperation("request", sdkHandle) {
        val clientRequest = ProtonDriveSdk.AccountRequest.parseFrom(data)
        logger("request for ${clientRequest.payloadCase.name} of size: ${data.capacity()}")
        val response = request(clientRequest)
        response { value = response }
    }

    @Suppress("TooGenericExceptionCaught", "unused") // Called by JNI
    fun onRecordMetric(data: ByteBuffer) = onCallback("recordMetric") {
        logger("Record metric for $name of size: ${data.capacity()}")
        recordMetric(ProtonSdk.MetricEvent.parseFrom(data))
    }

    @Suppress("TooGenericExceptionCaught")
    private fun onOperation(operation: String, sdkHandle: Long, block: suspend () -> Response) {
        coroutineScope(operation).launch {
            try {
                handleResponse(sdkHandle, block())
            } catch (error: CancellationException) {
                logger("Operation $operation was cancelled")
                handleResponse(sdkHandle, response {
                    this@response.error =
                        error.toProtonSdkError("Operation $operation was cancelled")
                })
                throw error
            } catch (error: Throwable) {
                // loggers here could be removed
                logger("Error while $operation")
                logger(error.stackTraceToString())
                handleResponse(sdkHandle, response {
                    this@response.error = error.toProtonSdkError("Error while $operation")
                })
            }
        }
    }

    @Suppress("TooGenericExceptionCaught")
    private fun onCallback(callback: String, block: suspend () -> Unit) {
        coroutineScope(callback).launch {
            try {
                block()
            } catch (error: CancellationException) {
                logger("Callback $callback was cancelled")
                throw error
            } catch (error: Throwable) {
                logger("Error while $callback")
                logger(error.stackTraceToString())
            }
        }
    }

    private fun coroutineScope(operation: String): CoroutineScope {
        checkNotNull(coroutineScope) {
            "No coroutineScope was provided to ${javaClass.simpleName}, cannot execute $operation"
        }
        if (!coroutineScope.isActive) {
            logger("CoroutineScope not active for $operation")
        }
        return coroutineScope
    }
}
