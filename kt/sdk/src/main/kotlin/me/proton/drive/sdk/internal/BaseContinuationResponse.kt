package me.proton.drive.sdk.internal

import com.google.protobuf.kotlin.toByteString
import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.extension.toError
import proton.sdk.ProtonSdk
import java.nio.ByteBuffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

abstract class BaseContinuationResponse<T>(
    private val continuation: CancellableContinuation<T>,
) : ResponseCallback {

    private val callSite = CallerException("Called from")

    protected fun parse(data: ByteBuffer, block: (ProtonSdk.Response) -> T) {
        runCatching { ProtonSdk.Response.parseFrom(data) }
            .recoverCatching { error ->
                throw ProtonDriveSdkException(
                    message = "Cannot parse message: ${data.toByteString().toStringUtf8()}",
                    cause = error,
                )
            }
            .mapCatching(block)
            .onSuccess { value ->
                if (continuation.isActive) {
                    continuation.resume(value)
                } else {
                    logger("Cannot resume inactive continuation")
                }
            }
            .onFailure { error ->
                if (continuation.isActive) {
                    continuation.resumeWithException(error)
                } else {
                    logger(
                        "Cannot resume with exception inactive continuation: ${error.message}" +
                            "\n${error.stackTraceToString()}"
                    )
                }
            }
    }

    private fun logger(
        message: String,
    ) = JniBase.globalSdkLogger(DEBUG, "drive.sdk.continuation", message)

    protected fun error(message: String): Nothing = throw ProtonDriveSdkException(
        message = message,
        cause = prepareCallSite(),
        error = null,
    )

    protected fun error(error: ProtonSdk.Error): Nothing = throw ProtonDriveSdkException(
        message = error.message,
        cause = prepareCallSite(),
        error = error.toError(),
    )

    private fun prepareCallSite(): CallerException = callSite.apply {
        // Remove the first few frames that are internal to this function
        stackTrace = stackTrace.dropWhile { element ->
            element.className.startsWith("me.proton.drive.sdk.internal.Jni").not()
        }.toTypedArray()
    }
}
