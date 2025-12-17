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
    val source = cancellationTokenSource()
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
