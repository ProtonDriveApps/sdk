package me.proton.drive.sdk

import me.proton.drive.sdk.internal.JniUploadController
import java.io.InputStream

class UploadController internal constructor(
    uploader: Uploader,
    internal val handle: Long,
    private val bridge: JniUploadController,
    private val inputStream: InputStream,
    override val cancellationTokenSource: CancellationTokenSource,
) : SdkNode(uploader), AutoCloseable, Cancellable {

    suspend fun awaitCompletion() = bridge.awaitCompletion(handle)

    suspend fun resume() = bridge.resume(handle)

    suspend fun pause() = bridge.pause(handle)

    suspend fun dispose() = bridge.dispose(handle)

    override fun close() {
        inputStream.close()
        bridge.free(handle)
        super.close()
    }
}
