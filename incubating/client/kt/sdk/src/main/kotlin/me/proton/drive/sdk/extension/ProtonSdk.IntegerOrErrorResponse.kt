package me.proton.drive.sdk.extension

import com.google.protobuf.Any
import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.ProtonDriveSdkException
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.ProtonDriveSdk.Response.ResultCase.ERROR
import proton.drive.sdk.ProtonDriveSdk.Response.ResultCase.RESULT_NOT_SET
import proton.drive.sdk.ProtonDriveSdk.Response.ResultCase.VALUE
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

fun <T> ProtonDriveSdk.Response.completeOrFail(deferred: CancellableContinuation<T>, block: (Any) -> T) {
    when (resultCase) {
        VALUE -> deferred.resume(block(value))
        RESULT_NOT_SET -> deferred.resumeWithException(ProtonDriveSdkException("No response (not set)"))
        ERROR -> deferred.resumeWithException(error.toException())
        null -> deferred.resumeWithException(ProtonDriveSdkException("No response (null)"))
    }
}
