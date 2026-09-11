package me.proton.drive.sdk.internal

import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import me.proton.drive.sdk.CancellationTokenSource
import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource

suspend fun <T> cancellationCoroutineScope(
    block: suspend (CancellationTokenSource) -> T,
): T = coroutineScope {
    cancellationTokenSource().use { source ->
        try {
            block(source)
        } finally {
            if (!isActive) {
                withContext(NonCancellable) {
                    source.cancel()
                }
            }
        }
    }
}

/** Creates a source owned by whatever [block] returns; it is only closed when [block] fails. */
@Suppress("TooGenericExceptionCaught")
suspend fun <T> ownedCancellationTokenSource(
    block: suspend (CancellationTokenSource) -> T,
): T {
    val source = cancellationTokenSource()
    return try {
        block(source)
    } catch (throwable: Throwable) {
        try {
            source.close()
        } catch (closeThrowable: Throwable) {
            throwable.addSuppressed(closeThrowable)
        }
        throw throwable
    }
}
