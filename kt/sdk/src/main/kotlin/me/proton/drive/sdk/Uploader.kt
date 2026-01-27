package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.entity.ThumbnailType
import java.nio.channels.ReadableByteChannel

interface Uploader : AutoCloseable, Cancellable {

    suspend fun uploadFromStream(
        coroutineScope: CoroutineScope,
        channel: ReadableByteChannel,
        thumbnails: Map<ThumbnailType, ByteArray> = emptyMap(),
    ): UploadController
}
