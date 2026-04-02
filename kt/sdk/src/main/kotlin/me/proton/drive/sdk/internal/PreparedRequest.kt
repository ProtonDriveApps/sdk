package me.proton.drive.sdk.internal

import me.proton.drive.sdk.extension.read
import me.proton.drive.sdk.extension.readAsStream
import okhttp3.RequestBody
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.HttpRequest

internal data class PreparedRequest(
    val request: HttpRequest,
    val method: String,
    val url: String,
    val headers: Map<String, String>,
    val body: RequestBody,
    val bodyMessage: String,
) {
    val isUploadBlock: Boolean get() = request.isUploadBlock
    val isDownloadBlock: Boolean get() = request.isDownloadBlock
    val isRetryEnabled: Boolean get() = request.isRetryEnabled
}

internal suspend fun HttpRequest.prepare(httpStream: HttpStream): PreparedRequest {
    val streamingRequest = isUploadBlock
    val body = if (streamingRequest) {
        httpStream.readAsStream(this)
    } else {
        httpStream.read(this)
    }
    val bodyMessage = when {
        !hasSdkContentHandle() -> "no"
        streamingRequest -> "streaming"
        else -> "${body.contentLength()}-byte"
    }
    return PreparedRequest(
        request = this,
        method = method,
        url = url,
        headers = headersList.associate { header ->
            header.name to header.valuesList.joinToString(",")
        },
        body = body,
        bodyMessage = bodyMessage,
    )
}

private val HttpRequest.isUploadBlock: Boolean
    get() =
        type == ProtonSdk.HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_UPLOAD

private val HttpRequest.isDownloadBlock: Boolean
    get() =
        type == ProtonSdk.HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_DOWNLOAD

private val HttpRequest.isRetryEnabled
    get() =
        type == ProtonSdk.HttpRequestType.HTTP_REQUEST_TYPE_REGULAR_API
