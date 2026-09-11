package me.proton.drive.sdk.internal

import me.proton.drive.sdk.extension.StreamingRequestBody
import me.proton.drive.sdk.extension.read
import me.proton.drive.sdk.extension.readAsStream
import okhttp3.RequestBody
import proton.drive.sdk.ProtonDriveSdk.HttpRequest
import proton.drive.sdk.ProtonDriveSdk.HttpRequestType

internal data class OutgoingRequest(
    val type: HttpRequestType,
    val method: String,
    val url: String,
    val headers: Map<String, String>,
    val body: RequestBody,
    val bodyMessage: String,
) {
    val isUploadBlock: Boolean get() = type == HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_UPLOAD
    val isDownloadBlock: Boolean get() = type == HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_DOWNLOAD
    val isRetryEnabled: Boolean get() = type == HttpRequestType.HTTP_REQUEST_TYPE_REGULAR_API
}

internal suspend fun <T> HttpRequest.withOutgoing(
    httpStream: HttpStream,
    block: suspend (OutgoingRequest) -> T,
): T {
    var streamingBody: StreamingRequestBody? = null
    return try {
        streamingBody = if (isUploadBlock) {
            httpStream.readAsStream(this)
        } else {
            null
        }
        val body = streamingBody ?: httpStream.read(this)
        val bodyMessage = when {
            !hasSdkContentHandle() -> "no"
            streamingBody != null -> "streaming"
            else -> "${body.contentLength()}-byte"
        }
        block(
            OutgoingRequest(
                type = type,
                method = method,
                url = url,
                headers = headersList.associate { header ->
                    header.name to header.valuesList.joinToString(",")
                },
                body = body,
                bodyMessage = bodyMessage,
            )
        )
    } finally {
        streamingBody?.cancel()
    }
}

private val HttpRequest.isUploadBlock: Boolean
    get() = type == HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_UPLOAD
