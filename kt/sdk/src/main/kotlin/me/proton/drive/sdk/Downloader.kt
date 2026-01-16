package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import java.io.OutputStream

interface Downloader : AutoCloseable, Cancellable {

    suspend fun downloadToStream(
        coroutineScope: CoroutineScope,
        outputStream: OutputStream,
        progress: suspend (Long, Long) -> Unit = { _, _ -> },
    ): DownloadController
}
