package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.proton.core.domain.entity.UserId
import me.proton.core.network.data.ApiProvider
import me.proton.core.network.data.ProtonErrorException
import me.proton.core.network.domain.ApiResult
import me.proton.drive.sdk.HttpSdkApi
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import okhttp3.ResponseBody
import proton.sdk.ProtonSdk.HttpRequest
import proton.sdk.ProtonSdk.HttpResponse
import proton.sdk.httpHeader
import proton.sdk.httpResponse
import retrofit2.Response
import java.nio.channels.Channels

internal class ApiProviderBridge(
    private val userId: UserId,
    private val apiProvider: ApiProvider,
    private val coroutineScope: CoroutineScope,
) : suspend (HttpRequest) -> HttpResponse {

    private var httpStreams = emptyList<HttpStream>()
    private val mutex = Mutex()

    override suspend fun invoke(request: HttpRequest): HttpResponse {
        val httpStream = createHttpStream()
        val preparedRequest = request.prepare(httpStream)
        val apiResult = RetryAfterDelay(isEnabled = preparedRequest.isRetryEnabled) {
            apiProvider.get<HttpSdkApi>(userId).invoke(
                forceNoRetryOnConnectionErrors = true
            ) {
                execute(preparedRequest)
            }
        }
        if (apiResult is ApiResult.Error) {
            val error = apiResult.cause
            if (error is ProtonErrorException) {
                val response = error.response
                return httpResponse {
                    statusCode = response.code
                    val responseHeaders = response.headers
                    responseHeaders.names().forEach { name ->
                        headers += httpHeader {
                            this@httpHeader.name = name
                            values.addAll(responseHeaders.values(name))
                        }
                    }
                    response.body?.byteStream()?.let { inputStream ->
                        bindingsContentHandle = httpStream.write(
                            coroutineScope = coroutineScope,
                            channel = Channels.newChannel(inputStream),
                        )
                    }
                }
            }
        }

        val response = apiResult.valueOrThrow

        return httpResponse {
            statusCode = response.code()
            val responseHeaders = response.headers()
            responseHeaders.names().forEach { name ->
                headers += httpHeader {
                    this@httpHeader.name = name
                    values.addAll(responseHeaders.values(name))
                }
            }
            response.body()?.byteStream()?.let { inputStream ->
                bindingsContentHandle = httpStream.write(
                    coroutineScope = coroutineScope,
                    channel = Channels.newChannel(inputStream),
                )
            }
        }
    }

    private suspend fun createHttpStream(): HttpStream {
        val jniHttpStream = JniHttpStream()
        val httpStream = HttpStream(
            bridge = jniHttpStream
        )
        jniHttpStream.onBodyRead = {
            mutex.withLock {
                httpStreams -= httpStream
                httpStream.close()
            }
        }
        mutex.withLock {
            httpStreams += httpStream
        }
        return httpStream
    }

    private suspend fun HttpSdkApi.execute(
        request: PreparedRequest,
    ): Response<ResponseBody> = with(request) {
        logger("--> $method $url ($bodyMessage body)")
        when (method.uppercase()) {
            "GET" -> if (isDownloadBlock) {
                getStreaming(url, headers)
            } else {
                get(url, headers)
            }

            "POST" -> post(url, headers, body)
            "PUT" -> put(url, headers, body)
            "DELETE" -> delete(url, headers, body)
            else -> throw IllegalArgumentException("Unsupported method: $method")
        }.also { response ->
            val contentLength = response.body()?.contentLength()
            val bodySize = if (contentLength != -1L) "$contentLength-byte" else "unknown-length"
            logger(
                "<-- ${response.code()} ${response.message()} $url ($bodySize body)"
            )
        }
    }

    fun logger(message: String) = JniBase.globalSdkLogger(DEBUG, "network", message)
}

