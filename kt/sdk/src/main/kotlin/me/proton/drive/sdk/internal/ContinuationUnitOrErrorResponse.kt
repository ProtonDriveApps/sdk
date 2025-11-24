package me.proton.drive.sdk.internal

import com.google.protobuf.kotlin.toByteString
import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.extension.toException
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.Response.ResultCase.ERROR
import proton.sdk.ProtonSdk.Response.ResultCase.RESULT_NOT_SET
import proton.sdk.ProtonSdk.Response.ResultCase.VALUE
import java.nio.ByteBuffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Suppress("TooGenericExceptionCaught")
class ContinuationUnitOrErrorResponse(
    private val deferred: CancellableContinuation<Unit>,
) : ResponseCallback {
    override fun invoke(data: ByteBuffer) {
        try {
            val parseFrom = ProtonSdk.Response.parseFrom(data)
            when (parseFrom.resultCase) {
                VALUE -> deferred.resumeWithException(
                    ProtonDriveSdkException("No response was expected but: ${parseFrom.value.typeUrl}")
                )

                RESULT_NOT_SET -> deferred.resume(Unit)
                ERROR -> deferred.resumeWithException(parseFrom.error.toException())
                null -> deferred.resumeWithException(ProtonDriveSdkException("No response (null)"))
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
