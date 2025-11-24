package me.proton.drive.sdk.extension

import proton.sdk.ProtonSdk

fun Throwable.toProtonSdkError(defaultMessage: String) = proton.sdk.error {
    type = javaClass.name
    this.message = this@toProtonSdkError.message ?: defaultMessage
    domain = ProtonSdk.ErrorDomain.Serialization
    context = stackTraceToString()
}
