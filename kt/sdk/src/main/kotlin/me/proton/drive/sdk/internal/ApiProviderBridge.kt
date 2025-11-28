package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.proton.core.domain.entity.UserId
import me.proton.core.network.data.ApiProvider
import me.proton.core.network.data.ProtonErrorException
import me.proton.core.network.domain.ApiResult
import me.proton.drive.sdk.HttpSdkApi
import me.proton.drive.sdk.extension.read
import okhttp3.ResponseBody
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.HttpRequest
import proton.sdk.ProtonSdk.HttpResponse
import proton.sdk.httpHeader
import proton.sdk.httpResponse
import retrofit2.Response

internal class ApiProviderBridge(
    private val userId: UserId,
    private val apiProvider: ApiProvider,
    private val coroutineScope: CoroutineScope,
) : suspend (HttpRequest) -> HttpResponse {

    private var httpStreams = emptyList<HttpStream>()
    private val mutex = Mutex()

    override suspend fun invoke(request: HttpRequest): HttpResponse {
        val httpStream = createHttpStream()
        val apiResult = RetryAfterDelay(isEnabled = request.isRetryEnabled) {
            apiProvider.get<HttpSdkApi>(userId).invoke(
                forceNoRetryOnConnectionErrors = true
            ) {
                execute(request, httpStream)
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
                        bindingsContentHandle = httpStream.write(coroutineScope, inputStream)
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
                bindingsContentHandle = httpStream.write(coroutineScope, inputStream)
            }
        }
    }

    private val HttpRequest.isUploadBlock: Boolean get() =
        type == ProtonSdk.HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_UPLOAD

    private val HttpRequest.isDownloadBlock: Boolean get() =
        type == ProtonSdk.HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_DOWNLOAD

    private val HttpRequest.isRetryEnabled get() =
        type == ProtonSdk.HttpRequestType.HTTP_REQUEST_TYPE_REGULAR_API

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
        request: HttpRequest,
        httpStream: HttpStream,
    ): Response<ResponseBody> {
        val method = request.method
        val url = request.url
        val headers = request.headersList.associate { header ->
            header.name to header.valuesList.joinToString(",")
        }
        val body = if (request.isUploadBlock) {
            httpStream.read(request)
            // TODO: no working yet request is seen in the log but not send
            //httpStream.readAsStream(request)
        } else {
            httpStream.read(request)
        }
        return when (method.uppercase()) {
            "GET" -> if (request.isDownloadBlock) {
                getStreaming(url, headers)
            } else {
                get(url, headers)
            }

            "POST" -> post(url, headers, body)
            "PUT" -> put(url, headers, body)
            "DELETE" -> delete(url, headers, body)
            else -> throw IllegalArgumentException("Unsupported method: $method")
        }
    }
}

