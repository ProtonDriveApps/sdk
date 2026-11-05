package me.proton.drive.sdk.extension

import android.system.ErrnoException
import android.system.OsConstants
import kotlinx.coroutines.CancellationException
import me.proton.drive.sdk.SdkHttpClientException
import me.proton.drive.sdk.internal.NoCoroutineScopeException
import proton.drive.sdk.ProtonDriveSdk
import java.io.FileNotFoundException
import java.io.IOException
import java.net.SocketException
import java.net.SocketTimeoutException

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

    is SdkHttpClientException -> when (this) {
        is SdkHttpClientException.Http -> ProtonDriveSdk.ErrorDomain.Api
        is SdkHttpClientException.Timeout -> ProtonDriveSdk.ErrorDomain.Transport
        is SdkHttpClientException.Connection -> ProtonDriveSdk.ErrorDomain.Network
        is SdkHttpClientException.Parse -> ProtonDriveSdk.ErrorDomain.Serialization
    }

    // A response body is streamed, so a timeout can also come while the Drive SDK reads it.
    is SocketTimeoutException -> ProtonDriveSdk.ErrorDomain.Transport
    is SocketException -> ProtonDriveSdk.ErrorDomain.Network

    is IOException -> if (fileSystemErrorCode() != null) {
        ProtonDriveSdk.ErrorDomain.FileSystem
    } else {
        ProtonDriveSdk.ErrorDomain.UnknownIO
    }

    else -> ProtonDriveSdk.ErrorDomain.Undefined
}

private fun Throwable.primaryCode(): Long? = when (this) {
    is SdkHttpClientException.Http -> protonCode?.toLong()
    is IOException -> fileSystemErrorCode()
    else -> null
}

private fun Throwable.secondaryCode(): Long? = when (this) {
    is SdkHttpClientException.Http -> statusCode.toLong()
    is IOException -> (cause as? ErrnoException)?.errno?.toLong()
    else -> null
}

private fun IOException.fileSystemErrorCode(): Long? = when {
    this is FileNotFoundException -> FileSystem.NOT_FOUND
    else -> when ((cause as? ErrnoException)?.errno) {
        OsConstants.ENOSPC, OsConstants.EDQUOT -> FileSystem.OUT_OF_SPACE
        OsConstants.EACCES, OsConstants.EPERM, OsConstants.EROFS -> FileSystem.PERMISSION_DENIED
        OsConstants.ENOENT -> FileSystem.NOT_FOUND
        else -> null
    }
}

private object FileSystem {
    const val OUT_OF_SPACE = 1L
    const val PERMISSION_DENIED = 2L
    const val NOT_FOUND = 3L
}
