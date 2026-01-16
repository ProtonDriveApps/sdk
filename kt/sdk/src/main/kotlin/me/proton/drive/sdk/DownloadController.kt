package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope

interface DownloadController : AutoCloseable, Cancellable {

    suspend fun awaitCompletion()
    suspend fun pause()
    suspend fun resume(coroutineScope: CoroutineScope)
    suspend fun isPaused(): Boolean
    suspend fun isDownloadCompleteWithVerificationIssue(): Boolean
}
