package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import java.nio.channels.WritableByteChannel

interface Downloader : AutoCloseable, Cancellable {

    suspend fun downloadToStream(
        coroutineScope: CoroutineScope,
        channel: WritableByteChannel,
    ): DownloadController
}
