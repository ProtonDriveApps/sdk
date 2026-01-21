package me.proton.drive.sdk.extension

import kotlinx.coroutines.CancellationException
import me.proton.core.network.domain.ApiException
import me.proton.core.network.domain.ApiResult
import me.proton.drive.sdk.internal.NoCoroutineScopeException
import proton.sdk.ProtonSdk

fun Throwable.toProtonSdkError(message: String) = proton.sdk.error {
    val exception = this@toProtonSdkError
    type = exception.javaClass.name
    this.message = exception.message?.let {
        "$message, caused by ${exception.message}"
    } ?: message
    domain = exception.domain()
    context = stackTraceToString()
}

private fun Throwable.domain(): ProtonSdk.ErrorDomain = when (this) {
    is NoCoroutineScopeException -> ProtonSdk.ErrorDomain.SuccessfulCancellation
    is CancellationException -> ProtonSdk.ErrorDomain.SuccessfulCancellation

    is ApiException -> when (error) {
        is ApiResult.Error.Http -> ProtonSdk.ErrorDomain.Api
        is ApiResult.Error.Timeout -> ProtonSdk.ErrorDomain.Transport
        is ApiResult.Error.Connection -> ProtonSdk.ErrorDomain.Network
        is ApiResult.Error.Parse -> ProtonSdk.ErrorDomain.Serialization
    }

    else -> ProtonSdk.ErrorDomain.Undefined
}
