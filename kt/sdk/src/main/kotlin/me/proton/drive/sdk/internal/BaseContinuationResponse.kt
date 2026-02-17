package me.proton.drive.sdk.internal

import com.google.protobuf.kotlin.toByteString
import me.proton.drive.sdk.ProtonDriveSdkException
import proton.sdk.ProtonSdk
import java.nio.ByteBuffer
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

abstract class BaseContinuationResponse<T>(
    private val continuation: Continuation<T>,
) : ResponseCallback {

    private val callSite = CallerException("Called from")

    protected fun parse(data: ByteBuffer, block: (ProtonSdk.Response) -> T) {
        runCatching { ProtonSdk.Response.parseFrom(data) }
            .recoverCatching { error ->
                throw ProtonDriveSdkException(
                    message = "Cannot parse message: ${data.toByteString().toStringUtf8()}",
                    cause = error,
                )
            }
            .mapCatching(block)
            .onSuccess(continuation::resume)
            .onFailure(::resumeWithException)
    }

    private fun resumeWithException(exception: Throwable) {
        continuation.resumeWithException(exception.apply {
            addSuppressed(callSite.apply {
                // Remove the first few frames that are internal to this function
                stackTrace = stackTrace.dropWhile { element ->
                    element.className.startsWith("me.proton.drive.sdk.internal.Jni").not()
                }.toTypedArray()
            })
        })
    }
}
