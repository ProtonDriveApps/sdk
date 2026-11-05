package me.proton.drive.sdk.internal

import me.proton.drive.sdk.SdkHttpClientException
import me.proton.drive.sdk.SdkHttpResponse
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

internal sealed interface HttpResult {
    data class Success(val response: SdkHttpResponse) : HttpResult
    data class Failure(val exception: SdkHttpClientException) : HttpResult
}

internal val HttpResult.statusCode: Int?
    get() = when (this) {
        is HttpResult.Success -> response.statusCode
        is HttpResult.Failure -> (exception as? SdkHttpClientException.Http)?.statusCode
    }

internal val HttpResult.retryAfter: Duration?
    get() = when (this) {
        is HttpResult.Success ->
            response.headers.entries
                .firstOrNull { (name, _) -> name.equals(RETRY_AFTER, ignoreCase = true) }
                ?.value
                ?.retryAfterSeconds()
        is HttpResult.Failure -> (exception as? SdkHttpClientException.Http)?.retryAfter
    }

private const val RETRY_AFTER = "Retry-After"

private fun List<String>.retryAfterSeconds(): Duration? = firstOrNull()?.trim()?.toLongOrNull()?.seconds
