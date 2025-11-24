package me.proton.drive.sdk

interface Cancellable {
    val cancellationTokenSource: CancellationTokenSource

    suspend fun cancel() {
        cancellationTokenSource.cancel()
    }
}
