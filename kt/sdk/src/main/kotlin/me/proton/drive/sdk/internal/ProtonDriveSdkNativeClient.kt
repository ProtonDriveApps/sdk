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
    external fun getAccountRequestPointer(): Long
    external fun getRecordMetricPointer(): Long

    @Suppress("unused") // Called by JNI
    fun onResponse(data: ByteBuffer) {
        logger("response for $name of size: ${data.capacity()}")
        response(data)
    }

    @Suppress("unused") // Called by JNI
    fun onProgress(data: ByteBuffer) = onCallback(
        callback = "progress",
        data = data,
        parser = ProtonDriveSdk.ProgressUpdate::parseFrom,
        block = progress,
    )

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
    fun onSendHttpRequest(
        data: ByteBuffer,
        sdkHandle: Long,
    ) = onRequest(
        operation = "http",
        data = data,
        sdkHandle = sdkHandle,
        parser = ProtonSdk.HttpRequest::parseFrom,
    ) { httpRequest ->
        logger("send http request for ${httpRequest.method} ${httpRequest.url} of size: ${data.capacity()}")
        val httpResponse = sendHttpRequest(httpRequest)
        logger("receive http response ${httpResponse.statusCode} for ${httpRequest.method} ${httpRequest.url}")
        response { value = httpResponse.asAny("proton.sdk.HttpResponse") }
    }

    @Suppress("unused") // Called by JNI
    fun onAccountRequest(
        data: ByteBuffer,
        sdkHandle: Long,
    ) = onRequest(
        operation = "request",
        data = data,
        sdkHandle = sdkHandle,
        parser = ProtonDriveSdk.AccountRequest::parseFrom,
    ) { accountRequest ->
        logger("request for ${accountRequest.payloadCase.name} of size: ${data.capacity()}")
        val response = request(accountRequest)
        response { value = response }
    }

    @Suppress("TooGenericExceptionCaught", "unused") // Called by JNI
    fun onRecordMetric(data: ByteBuffer) = onCallback(
        callback = "recordMetric",
        data = data,
        parser = ProtonSdk.MetricEvent::parseFrom,
        block = recordMetric,
    )

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
    private fun <T> onRequest(
        operation: String,
        data: ByteBuffer,
        sdkHandle: Long,
        parser: (ByteBuffer) -> T,
        block: suspend (T) -> Response
    ) {
        try {
            // parsing of protobuf needs to be done serially
            val request = parser(data)
            onOperation(operation, sdkHandle) { block(request) }
        } catch (error: Throwable) {
            handleResponse(sdkHandle, response {
                this@response.error = error.toProtonSdkError(
                    "Error while parsing request for $operation"
                )
            })
        }
    }

    @Suppress("TooGenericExceptionCaught")
    private fun <T> onCallback(
        callback: String,
        data: ByteBuffer,
        parser: (ByteBuffer) -> T,
        block: suspend (T) -> Unit
    ) {
        try {
            logger("callback for $name of size: ${data.capacity()}")
            // parsing of protobuf needs to be done serially
            val value = parser(data)
            coroutineScope(callback).launch {
                try {
                    block(value)
                } catch (error: CancellationException) {
                    logger("Callback $callback was cancelled")
                    throw error
                } catch (error: Throwable) {
                    logger("Error while $callback")
                    logger(error.stackTraceToString())
                }
            }
        } catch (error: Throwable) {
            logger("Error while parsing value for $callback")
            logger(error.stackTraceToString())
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
