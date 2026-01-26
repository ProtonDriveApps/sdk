package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.entity.UploadResult

interface UploadController : AutoCloseable, Cancellable {

    suspend fun awaitCompletion(): UploadResult
    suspend fun resume(coroutineScope: CoroutineScope)
    suspend fun pause()
    suspend fun isPaused(): Boolean
    suspend fun dispose()
}
