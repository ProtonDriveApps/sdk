package me.proton.drive.sdk

import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toProto
import me.proton.drive.sdk.internal.JniProtonPhotosClient
import me.proton.drive.sdk.internal.cancellationCoroutineScope
import me.proton.drive.sdk.internal.factory
import me.proton.drive.sdk.internal.toLogId
import proton.drive.sdk.drivePhotosClientEnumeratePhotosThumbnailsRequest
import java.io.OutputStream

class ProtonPhotosClient internal constructor(
    internal val handle: Long,
    private val bridge: JniProtonPhotosClient,
    session: Session? = null,
) : SdkNode(session), AutoCloseable {

    suspend fun getThumbnails(
        photoUids: List<String>,
        type: ThumbnailType,
        block: (String) -> OutputStream,
    ): Unit = cancellationCoroutineScope { source ->
        log(INFO, "getThumbnails($type)")
        bridge.getThumbnails(
            drivePhotosClientEnumeratePhotosThumbnailsRequest {
                this.photoUids += photoUids
                this.type = type.toProto()
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).thumbnailsList.forEach { photoThumbnail ->
            block(photoThumbnail.fileUid).use { outputStream ->
                outputStream.write(photoThumbnail.data.toByteArray())
            }
        }
    }

    override fun close() {
        log(DEBUG, "close")
        bridge.free(handle)
        super.close()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "ProtonPhotosClient(${handle.toLogId()}) $message")
    }
}

suspend fun Session.protonPhotosClientCreate(): ProtonPhotosClient =
    factory(JniProtonPhotosClient()) {
        val session = this@protonPhotosClientCreate
        ProtonPhotosClient(
            session = session,
            handle = create(handle),
            bridge = this,
        )
    }
