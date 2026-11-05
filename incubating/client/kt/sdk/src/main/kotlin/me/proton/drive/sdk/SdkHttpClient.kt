package me.proton.drive.sdk

import java.io.IOException
import java.io.InputStream
import kotlin.time.Duration

/**
 * Sends every request the SDK makes: the service API and the storage transfers at absolute URLs.
 *
 * Return any HTTP status as a response, including 4xx and 5xx; the SDK retries API requests on 429 and
 * 5xx, so the host must not retry them itself. Report transport failures by throwing [SdkHttpClientException].
 * The SDK never refreshes the session: a 401 is handed back to the caller.
 */
fun interface SdkHttpClient {
    suspend fun execute(request: SdkHttpRequest): SdkHttpResponse
}

enum class SdkHttpRequestType {
    API,
    STORAGE_DOWNLOAD,
    STORAGE_UPLOAD,
    SMALL_UPLOAD
}

/**
 * [body] is null when the request has none, and is streamed for [SdkHttpRequestType.STORAGE_UPLOAD]
 * ([contentLength] is then -1). The SDK closes it when [SdkHttpClient.execute] returns.
 */
data class SdkHttpRequest(
    val type: SdkHttpRequestType,
    val method: String,
    val url: String,
    val headers: Map<String, String>,
    val body: InputStream?,
    val contentLength: Long
) {
    // The headers carry the session and storage tokens, so only their names may reach a log.
    override fun toString(): String =
        "SdkHttpRequest(type=$type, method=$method, url=$url, headers=${headers.keys}, contentLength=$contentLength)"
}

/**
 * [body] is streamed, never buffered whole. The Drive SDK closes it once it is done with the response, so the host must not
 * close it; an error response is closed as soon as the Drive SDK has read its error.
 */
data class SdkHttpResponse(
    val statusCode: Int,
    val headers: Map<String, List<String>>,
    val body: InputStream?
) {
    // The headers can carry cookies and session values, so only their names may reach a log.
    override fun toString(): String = "SdkHttpResponse(statusCode=$statusCode, headers=${headers.keys})"
}

sealed class SdkHttpClientException(
    message: String?,
    cause: Throwable?
) : IOException(message, cause) {

    /** The service answered, but no response is available to hand back. */
    class Http(
        val statusCode: Int,
        val protonCode: Int? = null,
        val retryAfter: Duration? = null,
        message: String? = null
    ) : SdkHttpClientException(message ?: "HTTP $statusCode", null)

    class Timeout(cause: Throwable? = null) : SdkHttpClientException("The request timed out", cause)

    class Connection(cause: Throwable? = null) : SdkHttpClientException("The connection failed", cause)

    class Parse(cause: Throwable? = null) : SdkHttpClientException("The response could not be read", cause)
}
