package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import me.proton.drive.sdk.LoggerProvider.Level.ERROR

/** Isolates the SDK from the caller's scope, which a failing operation must neither cancel nor crash. */
internal fun clientScope(parentScope: CoroutineScope): CoroutineScope {
    val scope = CoroutineScope(
        parentScope.coroutineContext.minusKey(Job) +
            SupervisorJob() +
            CoroutineExceptionHandler { _, error ->
                // Fatal JVM errors belong to the default handler, as everywhere else in the SDK.
                if (error !is Exception) throw error
                JniBase.globalSdkLogger(ERROR, "internal", "Uncaught error: ${error.stackTraceToString()}")
            }
    )
    val parentHandle = parentScope.coroutineContext[Job]?.invokeOnCompletion { scope.cancel() }
    parentHandle?.let { handle -> scope.coroutineContext[Job]?.invokeOnCompletion { handle.dispose() } }
    return scope
}

@Suppress("TooGenericExceptionCaught")
internal suspend fun <T> CoroutineScope.cancelOnFailure(block: suspend () -> T): T = try {
    block()
} catch (error: Throwable) {
    cancel()
    throw error
}
