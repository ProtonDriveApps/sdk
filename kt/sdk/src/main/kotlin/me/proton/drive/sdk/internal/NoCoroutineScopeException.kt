package me.proton.drive.sdk.internal

class NoCoroutineScopeException(
    message: String? = null,
    cause: Throwable? = null,
) : Throwable(message, cause)
