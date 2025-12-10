package me.proton.drive.sdk.extension

import kotlinx.coroutines.CancellationException
import me.proton.core.network.domain.ApiException
import me.proton.core.network.domain.ApiResult
import proton.sdk.ProtonSdk

fun Throwable.toProtonSdkError(defaultMessage: String) = proton.sdk.error {
    val exception = this@toProtonSdkError
    type = exception.javaClass.name
    message = exception.message ?: defaultMessage
    domain = exception.domain()
    context = stackTraceToString()
}

private fun Throwable.domain(): ProtonSdk.ErrorDomain = when (this) {
    is CancellationException -> ProtonSdk.ErrorDomain.SuccessfulCancellation

    is ApiException -> when (error) {
        is ApiResult.Error.Http -> ProtonSdk.ErrorDomain.Api
        is ApiResult.Error.Timeout -> ProtonSdk.ErrorDomain.Transport
        is ApiResult.Error.Connection -> ProtonSdk.ErrorDomain.Network
        is ApiResult.Error.Parse -> ProtonSdk.ErrorDomain.Serialization
    }

    else -> ProtonSdk.ErrorDomain.Undefined
}
