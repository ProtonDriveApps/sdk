package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow

interface DownloadController : AutoCloseable, Cancellable {

    val progressFlow: Flow<ProgressUpdate?>

    suspend fun awaitCompletion()
    suspend fun pause()
    suspend fun resume(coroutineScope: CoroutineScope)
    suspend fun isPaused(): Boolean
    suspend fun isDownloadCompleteWithVerificationIssue(): Boolean
}
