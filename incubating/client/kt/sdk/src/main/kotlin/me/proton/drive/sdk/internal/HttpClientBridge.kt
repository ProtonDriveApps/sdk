package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import proton.drive.sdk.ProtonDriveSdk.HttpRequest
import proton.drive.sdk.ProtonDriveSdk.HttpResponse
import proton.drive.sdk.httpHeader
import proton.drive.sdk.httpResponse
import java.io.InputStream
import java.nio.channels.Channels

internal fun interface HttpTransport {
    suspend fun execute(request: OutgoingRequest, attempt: Int): HttpResult
}

internal class HttpClientBridge(
    private val transport: HttpTransport,
    private val coroutineScope: CoroutineScope,
    private val newHttpStream: () -> HttpStream = { InteropHttpStream(bridge = JniHttpStream()) },
) : suspend (HttpRequest) -> HttpResponse {

    private var httpStreams = emptyList<HttpStream>()
    private val mutex = Mutex()

    @Suppress("TooGenericExceptionCaught")
    override suspend fun invoke(request: HttpRequest): HttpResponse {
        val httpStream = createHttpStream()
        return try {
            respond(httpStream, request)
        } catch (throwable: Throwable) {
            // The SDK never took ownership, so nothing else will ever release this stream.
            withContext(NonCancellable) { releaseHttpStream(httpStream) }
            throw throwable
        }
    }

    private suspend fun respond(httpStream: HttpStream, request: HttpRequest): HttpResponse {
        val result = request.withOutgoing(httpStream) { outgoing ->
            RetryAfterDelay.execute(isEnabled = outgoing.isRetryEnabled) { attempt ->
                executeLogged(outgoing, attempt)
            }
        }
        val response = when (result) {
            is HttpResult.Success -> result.response
            is HttpResult.Failure -> throw result.exception
        }
        return try {
            httpResponse {
                statusCode = response.statusCode
                for ((name, headerValues) in response.headers) {
                    // A Java host can hand over a null name: HttpURLConnection lists the status line under one.
                    val nullableName: String? = name
                    val headerName = nullableName ?: continue
                    headers += httpHeader {
                        this@httpHeader.name = headerName
                        values.addAll(headerValues)
                    }
                }
                httpStream.createBindingsContentHandle(response.body)?.let {
                    bindingsContentHandle = it
                }
            }
        } catch (throwable: Throwable) {
            response.body?.close()
            throw throwable
        }
    }

    private suspend fun createHttpStream(): HttpStream {
        val httpStream = newHttpStream()
        mutex.withLock {
            httpStreams += httpStream
        }
        return httpStream
    }

    private suspend fun HttpStream.createBindingsContentHandle(
        inputStream: InputStream?,
    ): Long? {
        if (inputStream == null) {
            releaseHttpStream(this)
            return null
        }

        return write(
            coroutineScope = coroutineScope,
            channel = Channels.newChannel(inputStream),
            onDispose = { releaseHttpStream(this) }
        )
    }

    private suspend fun releaseHttpStream(httpStream: HttpStream) {
        mutex.withLock {
            httpStreams -= httpStream
            httpStream.close()
        }
    }

    @Suppress("TooGenericExceptionCaught")
    private suspend fun executeLogged(request: OutgoingRequest, attempt: Int): HttpResult = with(request) {
        val attemptSuffix = if (attempt > 0) " [retry $attempt]" else ""
        try {
            logger("--> $method $url ($bodyMessage body)$attemptSuffix")
            transport.execute(request, attempt).also { result ->
                logger("<-- ${result.statusCode ?: "FAILED"} $url$attemptSuffix")
            }
        } catch (e: Exception) {
            logger("<-- HTTP FAILED: $url ($e)$attemptSuffix")
            throw e
        }
    }

    fun logger(message: String) = JniBase.globalSdkLogger(DEBUG, "network", message)
}
