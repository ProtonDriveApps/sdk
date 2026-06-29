package me.proton.drive.sdk.extension

import kotlinx.coroutines.CancellationException
import me.proton.core.network.domain.ApiException
import me.proton.core.network.domain.ApiResult
import me.proton.drive.sdk.internal.NoCoroutineScopeException
import proton.drive.sdk.ProtonDriveSdk

fun Throwable.toProtonSdkError(message: String) = proton.drive.sdk.error {
    val exception = this@toProtonSdkError
    type = exception.javaClass.name
    this.message = exception.message?.let {
        "$message, caused by ${exception.message}"
    } ?: message
    domain = exception.domain()
    exception.primaryCode()?.let { primaryCode = it }
    exception.secondaryCode()?.let { secondaryCode = it }
    context = stackTraceToString()
}

private fun Throwable.domain(): ProtonDriveSdk.ErrorDomain = when (this) {
    is NoCoroutineScopeException -> ProtonDriveSdk.ErrorDomain.SuccessfulCancellation
    is CancellationException -> ProtonDriveSdk.ErrorDomain.SuccessfulCancellation

    is ApiException -> when (error) {
        is ApiResult.Error.Http -> ProtonDriveSdk.ErrorDomain.Api
        is ApiResult.Error.Timeout -> ProtonDriveSdk.ErrorDomain.Transport
        is ApiResult.Error.Connection -> ProtonDriveSdk.ErrorDomain.Network
        is ApiResult.Error.Parse -> ProtonDriveSdk.ErrorDomain.Serialization
    }

    else -> ProtonDriveSdk.ErrorDomain.Undefined
}

private fun Throwable.primaryCode(): Long? =
    ((this as? ApiException)?.error as? ApiResult.Error.Http)?.proton?.code?.toLong()

private fun Throwable.secondaryCode(): Long? =
    ((this as? ApiException)?.error as? ApiResult.Error.Http)?.httpCode?.toLong()
