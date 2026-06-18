package me.proton.drive.sdk.extension

import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.converter.AnyConverter
import me.proton.drive.sdk.internal.ContinuationValueOrErrorResponse
import me.proton.drive.sdk.internal.ContinuationValueOrNullResponse
import me.proton.drive.sdk.internal.ResponseCallback

val <T> AnyConverter<T>.asCallback
    get(): (CancellableContinuation<T>) -> ResponseCallback = { continuation ->
        ContinuationValueOrErrorResponse(continuation, this)
    }

val <T> AnyConverter<T>.asNullableCallback
    get(): (CancellableContinuation<T?>) -> ResponseCallback = { continuation ->
        ContinuationValueOrNullResponse(continuation, this)
    }
