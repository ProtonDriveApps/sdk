package me.proton.drive.sdk.extension

import kotlinx.coroutines.CancellableContinuation
import kotlin.coroutines.resumeWithException
import me.proton.drive.sdk.converter.BooleanConverter
import me.proton.drive.sdk.converter.IntConverter
import me.proton.drive.sdk.converter.LongConverter
import me.proton.drive.sdk.converter.StringConverter
import me.proton.drive.sdk.internal.ContinuationUnitOrErrorResponse
import me.proton.drive.sdk.internal.ContinuationValueOrErrorResponse
import me.proton.drive.sdk.internal.ResponseCallback

fun CancellableContinuation<Unit>.toUnitResponse(): ResponseCallback =
    ContinuationUnitOrErrorResponse(this)

val UnitResponseCallback: (CancellableContinuation<Unit>) -> ResponseCallback =
    CancellableContinuation<Unit>::toUnitResponse

fun CancellableContinuation<Int>.toIntResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, IntConverter())

val IntResponseCallback: (CancellableContinuation<Int>) -> ResponseCallback =
    CancellableContinuation<Int>::toIntResponse

fun CancellableContinuation<Boolean>.toBooleanResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, BooleanConverter())

val BooleanResponseCallback: (CancellableContinuation<Boolean>) -> ResponseCallback =
    CancellableContinuation<Boolean>::toBooleanResponse

fun CancellableContinuation<Long>.toLongResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, LongConverter())

val LongResponseCallback: (CancellableContinuation<Long>) -> ResponseCallback =
    CancellableContinuation<Long>::toLongResponse

/**
 * For a native handle that holds resources (e.g. a transfer queue slot): if it arrives after the caller
 * stopped waiting, it is passed to [free] instead of being leaked. A zero handle means none was created.
 */
fun handleResponseCallback(free: (Long) -> Unit): (CancellableContinuation<Long>) -> ResponseCallback =
    { continuation ->
        ContinuationValueOrErrorResponse(continuation, LongConverter()) { handle ->
            if (handle != 0L) free(handle)
        }
    }

fun CancellableContinuation<String>.toStringResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, StringConverter())

val StringResponseCallback: (CancellableContinuation<String>) -> ResponseCallback =
    CancellableContinuation<String>::toStringResponse

fun <T> CancellableContinuation<T>.resumeWithReleaseException(operation: String) {
    resumeWithException(IllegalStateException("Cannot $operation after release"))
}
