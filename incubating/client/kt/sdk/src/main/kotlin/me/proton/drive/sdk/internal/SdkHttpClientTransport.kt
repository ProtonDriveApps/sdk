package me.proton.drive.sdk.internal

import me.proton.drive.sdk.SdkHttpClient
import me.proton.drive.sdk.SdkHttpClientException
import me.proton.drive.sdk.SdkHttpRequest
import me.proton.drive.sdk.SdkHttpRequestType
import me.proton.drive.sdk.extension.StreamingRequestBody
import okhttp3.RequestBody
import okio.Buffer
import proton.drive.sdk.ProtonDriveSdk.HttpRequestType
import java.io.InputStream

internal class SdkHttpClientTransport(
    private val client: SdkHttpClient
) : HttpTransport {

    override suspend fun execute(request: OutgoingRequest, attempt: Int): HttpResult {
        val body = request.body.toInputStream()
        return try {
            HttpResult.Success(client.execute(request.toSdkRequest(body)))
        } catch (exception: SdkHttpClientException) {
            HttpResult.Failure(exception)
        } finally {
            body?.close()
        }
    }
}

private fun OutgoingRequest.toSdkRequest(body: InputStream?) = SdkHttpRequest(
    type = type.toSdk(),
    method = method,
    url = url,
    headers = headers,
    body = body,
    contentLength = this.body.contentLength()
)

private fun RequestBody.toInputStream(): InputStream? = when {
    this is StreamingRequestBody -> openStream()
    contentLength() == 0L -> null
    else -> Buffer().also(::writeTo).inputStream()
}

private fun HttpRequestType.toSdk() = when (this) {
    HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_DOWNLOAD -> SdkHttpRequestType.STORAGE_DOWNLOAD
    HttpRequestType.HTTP_REQUEST_TYPE_STORAGE_UPLOAD -> SdkHttpRequestType.STORAGE_UPLOAD
    HttpRequestType.HTTP_REQUEST_TYPE_SMALL_UPLOAD -> SdkHttpRequestType.SMALL_UPLOAD
    else -> SdkHttpRequestType.API
}
