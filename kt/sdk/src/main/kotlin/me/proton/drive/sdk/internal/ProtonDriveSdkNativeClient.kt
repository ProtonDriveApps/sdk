package me.proton.drive.sdk.internal

import com.google.protobuf.Any
import com.google.protobuf.Int32Value
import com.google.protobuf.StringValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import me.proton.drive.sdk.LoggerProvider.Level
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.ERROR
import me.proton.drive.sdk.LoggerProvider.Level.VERBOSE
import me.proton.drive.sdk.LoggerProvider.Level.WARN
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
    val httpClientRequest: suspend (ProtonSdk.HttpRequest) -> HttpResponse = { error("httpClientRequest not configured for $name") },
    val readHttpBody: suspend (ByteBuffer) -> Int = { error("readHttpBody not configured for $name") },
    val accountRequest: suspend (ProtonDriveSdk.AccountRequest) -> Any = { error("accountRequest not configured for $name") },
    val progress: suspend (ProtonDriveSdk.ProgressUpdate) -> Unit = { error("progress not configured for $name") },
    val recordMetric: suspend (ProtonSdk.MetricEvent) -> Unit = { error("recordMetric not configured for $name") },
    val featureEnabled: suspend (String) -> Boolean = { error("featureEnabled not configured for $name") },
    val logger: (Level, String) -> Unit = { _, _ -> },
    private val coroutineScopeProvider: CoroutineScopeProvider = { null },
) {

    private val byteArrayPointers = ByteArrayPointers()

    fun release() {
        byteArrayPointers.releaseAll()
    }

    fun handleRequest(
        request: ProtonDriveSdk.Request,
    ) {
        logger(VERBOSE, "handle request ${request.payloadCase.name} for $name")
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
            logger(VERBOSE, "handle response value: ${response.value.typeUrl} for $name")
        } else {
            if (response.resultCase == Response.ResultCase.ERROR) {
                logger(VERBOSE, "handle response ${response.resultCase.name} for $name (${response.error.message})")
            } else {
                logger(VERBOSE, "handle response ${response.resultCase.name} for $name")
            }
        }
        handleResponse(sdkHandle, response.toByteArray())
    }

    fun getByteArrayPointer(data: ByteArray): Long = byteArrayPointers.allocate(data)

    external fun createWeakRef(): Long

    @Suppress("unused") // Called by JNI
    fun onResponse(data: ByteBuffer) {
        logger(VERBOSE, "response for $name of size: ${data.capacity()}")
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
    fun onRead(buffer: ByteBuffer, sdkHandle: Long) {
        onOperation("read", sdkHandle) {
            logger(VERBOSE, "read for $name of size: ${buffer.capacity()}")
            val bytesRead = read(buffer).takeUnless { it < 0 } ?: 0
            logger(VERBOSE, "$bytesRead bytes read for $name")
            response { value = Int32Value.of(bytesRead).asAny("google.protobuf.Int32Value") }
        }
    }

    @Suppress("unused") // Called by JNI
    fun onWrite(data: ByteBuffer, sdkHandle: Long) {
        onOperation("write", sdkHandle) {
            logger(VERBOSE, "write for $name of size: ${data.capacity()}")
            write(data)
            response {}
        }
    }

    @Suppress("unused") // Called by JNI
    fun onSendHttpRequest(
        data: ByteBuffer,
        sdkHandle: Long,
    ): Long = onRequest(
        operation = "http-request",
        data = data,
        sdkHandle = sdkHandle,
        parser = ProtonSdk.HttpRequest::parseFrom,
    ) { httpRequest ->
        logger(
            DEBUG,
            "send http request for ${httpRequest.method} ${httpRequest.url} of size: ${data.capacity()}"
        )
        val httpResponse = httpClientRequest(httpRequest)
        logger(
            DEBUG,
            "receive http response ${httpResponse.statusCode} for ${httpRequest.method} ${httpRequest.url}"
        )
        response { value = httpResponse.asAny("proton.sdk.HttpResponse") }
    }?.createWeakRef() ?: 0

    @Suppress("unused") // Called by JNI
    fun onHttpResponseRead(buffer: ByteBuffer, sdkHandle: Long) {
        onOperation("http-response", sdkHandle) {
            logger(VERBOSE, "http response read for $name of size: ${buffer.capacity()}")
            val bytesRead = readHttpBody(buffer).takeUnless { it < 0 } ?: 0
            logger(VERBOSE, "$bytesRead bytes read for http response $name")
            response { value = Int32Value.of(bytesRead).asAny("google.protobuf.Int32Value") }
        }
    }

    @Suppress("unused") // Called by JNI
    fun onAccountRequest(
        data: ByteBuffer,
        sdkHandle: Long,
    ) {
        onRequest(
            operation = "request",
            data = data,
            sdkHandle = sdkHandle,
            parser = ProtonDriveSdk.AccountRequest::parseFrom,
        ) { accountRequest ->
            logger(VERBOSE, "request for ${accountRequest.payloadCase.name} of size: ${data.capacity()}")
            val response = accountRequest(accountRequest)
            response { value = response }
        }
    }

    @Suppress("TooGenericExceptionCaught", "unused") // Called by JNI
    fun onRecordMetric(data: ByteBuffer) = onCallback(
        callback = "recordMetric",
        data = data,
        parser = ProtonSdk.MetricEvent::parseFrom,
        block = recordMetric,
    )

    @Suppress("TooGenericExceptionCaught", "unused") // Called by JNI
    fun onFeatureEnabled(data: ByteBuffer): Long = onFunction(
        operation = "featureEnabled",
        data = data,
        parser = StringValue::parseFrom,
    ) { value ->
        val name = value.value
        runCatching {
            if (featureEnabled(name)) 1L else 0L
        }.getOrElse { error ->
            logger(WARN, "Cannot get feature flag $name")
            logger(WARN, error.stackTraceToString())
            0L
        }
    }

    private fun <T, R> onFunction(
        operation: String,
        data: ByteBuffer,
        parser: (ByteBuffer) -> T,
        block: suspend (T) -> R
    ): R = runBlocking {
        val value = parser(data)
        coroutineScope(operation).async { block(value) }.await()
    }

    @Suppress("TooGenericExceptionCaught")
    private fun onOperation(
        operation: String,
        sdkHandle: Long,
        block: suspend () -> Response,
    ): Job = coroutineScope(operation).launch {
        handleResponse(sdkHandle, block())
    }.also { job ->
        job.invokeOnCompletion { error ->
            when (error) {
                null -> Unit // job completed normally
                is CancellationException -> {
                    logger(DEBUG, "Operation $operation was cancelled")
                    handleResponse(sdkHandle, response {
                        this@response.error =
                            error.toProtonSdkError("Operation $operation was cancelled")
                    })
                }

                else -> handleResponse(sdkHandle, response {
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
    ): Job? = try {
        // parsing of protobuf needs to be done serially
        val request = parser(data)
        onOperation(operation, sdkHandle) { block(request) }
    } catch (error: Throwable) {
        handleResponse(sdkHandle, response {
            this@response.error = error.toProtonSdkError(
                "Error while parsing request for $operation"
            )
        })
        null
    }

    @Suppress("TooGenericExceptionCaught")
    private fun <T> onCallback(
        callback: String,
        data: ByteBuffer,
        parser: (ByteBuffer) -> T,
        block: suspend (T) -> Unit
    ) {
        try {
            logger(VERBOSE, "$callback for $name of size: ${data.capacity()}")
            // parsing of protobuf needs to be done serially
            val value = parser(data)
            coroutineScope(callback).launch {
                block(value)
            }.invokeOnCompletion { error ->
                when (error) {
                    null -> Unit // job completed normally
                    is CancellationException -> {
                        logger(DEBUG, "Callback $callback was cancelled")
                    }

                    else -> {
                        logger(WARN, "Error while $callback")
                        logger(WARN, error.stackTraceToString())
                    }
                }
            }
        } catch (error: Throwable) {
            logger(ERROR, "Error while parsing value for $callback")
            logger(ERROR, error.stackTraceToString())
        }

    }

    private fun coroutineScope(operation: String): CoroutineScope {
        val scope = coroutineScopeProvider()
        checkNotNull(scope) {
            "No coroutineScope was provided to ${javaClass.simpleName}, cannot execute $operation"
        }
        if (!scope.isActive) {
            logger(DEBUG, "CoroutineScope not active for $operation")
        }
        return scope
    }

    companion object {
        @JvmStatic
        external fun handleResponse(sdkHandle: Long, response: ByteArray)

        @JvmStatic
        external fun getReadPointer(): Long

        @JvmStatic
        external fun getWritePointer(): Long

        @JvmStatic
        external fun getProgressPointer(): Long

        @JvmStatic
        external fun getHttpClientRequestPointer(): Long

        @JvmStatic
        external fun getHttpResponseReadPointer(): Long

        @JvmStatic
        external fun getAccountRequestPointer(): Long

        @JvmStatic
        external fun getRecordMetricPointer(): Long

        @JvmStatic
        external fun getFeatureEnabledPointer(): Long
    }
}
