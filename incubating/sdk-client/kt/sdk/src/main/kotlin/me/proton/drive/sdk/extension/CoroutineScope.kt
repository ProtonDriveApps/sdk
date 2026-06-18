package me.proton.drive.sdk.extension

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import me.proton.drive.sdk.Cancellable

suspend fun <T, R> T.use(
    scope: CoroutineScope,
    block: suspend (T) -> R,
): R where T : Cancellable, T : AutoCloseable = use {
    try {
        block(this)
    } finally {
        if (!scope.isActive) {
            withContext(NonCancellable) {
                cancel()
            }
        }
    }
}


suspend fun <T, R> CoroutineScope.withCancellable(
    cancellable: T,
    block: suspend (T) -> R,
): R where T : Cancellable, T : AutoCloseable = cancellable.use {
    try {
        block(cancellable)
    } finally {
        if (!isActive) {
            withContext(NonCancellable) {
                cancellable.cancel()
            }
        }
    }
}
