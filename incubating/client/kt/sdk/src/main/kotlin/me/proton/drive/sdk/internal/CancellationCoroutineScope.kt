package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellationException
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
suspend fun <T> ownedCancellationTokenSource(
    block: suspend (CancellationTokenSource) -> T,
): T = ownedCancellationTokenSource(cancellationTokenSource(), block)

@Suppress("TooGenericExceptionCaught")
internal suspend fun <T> ownedCancellationTokenSource(
    source: CancellationTokenSource,
    block: suspend (CancellationTokenSource) -> T,
): T {
    return try {
        block(source)
    } catch (throwable: Throwable) {
        if (throwable is CancellationException) {
            // Freeing the source does not cancel it, so a native operation still waiting
            // (e.g. for a transfer queue slot) would otherwise complete with nobody to release it.
            try {
                withContext(NonCancellable) {
                    source.cancel()
                }
            } catch (cancelThrowable: Throwable) {
                throwable.addSuppressed(cancelThrowable)
            }
        }
        try {
            source.close()
        } catch (closeThrowable: Throwable) {
            throwable.addSuppressed(closeThrowable)
        }
        throw throwable
    }
}
