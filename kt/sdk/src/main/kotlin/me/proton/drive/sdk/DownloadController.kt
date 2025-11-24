package me.proton.drive.sdk

import me.proton.drive.sdk.internal.JniDownloadController

class DownloadController internal constructor(
    downloader: Downloader,
    internal val handle: Long,
    private val bridge: JniDownloadController,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(downloader), AutoCloseable, Cancellable {

    suspend fun awaitCompletion() = bridge.awaitCompletion(handle)

    suspend fun resume() = bridge.resume(handle)

    suspend fun pause() = bridge.pause(handle)

    override fun close() = bridge.free(handle)
}
