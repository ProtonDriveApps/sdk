package me.proton.drive.sdk.extension

import kotlinx.coroutines.CancellableContinuation
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

fun CancellableContinuation<String>.toStringResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, StringConverter())

val StringResponseCallback: (CancellableContinuation<String>) -> ResponseCallback =
    CancellableContinuation<String>::toStringResponse
