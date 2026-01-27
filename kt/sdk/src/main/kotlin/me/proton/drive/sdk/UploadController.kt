package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import me.proton.drive.sdk.entity.UploadResult

interface UploadController : AutoCloseable, Cancellable {

    val progressFlow: Flow<ProgressUpdate?>

    suspend fun awaitCompletion(): UploadResult
    suspend fun resume(coroutineScope: CoroutineScope)
    suspend fun pause()
    suspend fun isPaused(): Boolean
    suspend fun dispose()
}
