package me.proton.drive.sdk.extension

import com.google.protobuf.Any
import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.ProtonDriveSdkException
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.Response.ResultCase.ERROR
import proton.sdk.ProtonSdk.Response.ResultCase.RESULT_NOT_SET
import proton.sdk.ProtonSdk.Response.ResultCase.VALUE
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

fun <T> ProtonSdk.Response.completeOrFail(deferred: CancellableContinuation<T>, block: (Any) -> T) {
    when (resultCase) {
        VALUE -> deferred.resume(block(value))
        RESULT_NOT_SET -> deferred.resumeWithException(ProtonDriveSdkException("No response (not set)"))
        ERROR -> deferred.resumeWithException(error.toException())
        null -> deferred.resumeWithException(ProtonDriveSdkException("No response (null)"))
    }
}
