package me.proton.drive.sdk.internal

import com.google.protobuf.kotlin.toByteString
import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.converter.AnyConverter
import me.proton.drive.sdk.extension.toException
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.Response.ResultCase.ERROR
import proton.sdk.ProtonSdk.Response.ResultCase.RESULT_NOT_SET
import proton.sdk.ProtonSdk.Response.ResultCase.VALUE
import java.nio.ByteBuffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Suppress("TooGenericExceptionCaught")
class ContinuationValueOrNullResponse<T>(
    private val deferred: CancellableContinuation<T?>,
    private val anyConverter: AnyConverter<T>,
) : ResponseCallback {
    override fun invoke(data: ByteBuffer) {
        try {
            val parseFrom = ProtonSdk.Response.parseFrom(data)
            when (parseFrom.resultCase) {
                VALUE -> {
                    check(parseFrom.value.typeUrl == anyConverter.typeUrl) {
                        "Wrong converter for ${parseFrom.value.typeUrl} (${anyConverter.typeUrl})"
                    }
                    deferred.resume(anyConverter.convert(parseFrom.value))
                }

                RESULT_NOT_SET -> deferred.resume(null)
                ERROR -> deferred.resumeWithException(parseFrom.error.toException())
                null -> deferred.resume(null)
            }
        } catch (error: Throwable) {
            deferred.resumeWithException(
                ProtonDriveSdkException(
                    message = "Cannot parse message: ${data.toByteString().toStringUtf8()}",
                    cause = error,
                )
            )
        }
    }
}
