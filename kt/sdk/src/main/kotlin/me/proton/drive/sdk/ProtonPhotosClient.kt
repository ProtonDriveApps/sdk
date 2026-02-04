package me.proton.drive.sdk

import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.entity.PhotosTimelineItem
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toProto
import me.proton.drive.sdk.internal.JniProtonPhotosClient
import me.proton.drive.sdk.internal.cancellationCoroutineScope
import me.proton.drive.sdk.internal.factory
import me.proton.drive.sdk.internal.toLogId
import proton.drive.sdk.drivePhotosClientEnumeratePhotosThumbnailsRequest
import proton.drive.sdk.drivePhotosClientEnumeratePhotosTimelineRequest
import proton.drive.sdk.drivePhotosClientGetNodeRequest
import proton.drive.sdk.drivePhotosClientGetPhotosRootRequest
import java.nio.channels.WritableByteChannel

class ProtonPhotosClient internal constructor(
    internal val handle: Long,
    private val bridge: JniProtonPhotosClient,
    session: Session? = null,
) : SdkNode(session), AutoCloseable {

    suspend fun getThumbnails(
        photoUids: List<String>,
        type: ThumbnailType,
        block: (String) -> WritableByteChannel,
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
                outputStream.write(photoThumbnail.data.asReadOnlyByteBuffer())
            }
        }
    }

    suspend fun getPhotosRoot(): FolderNode = cancellationCoroutineScope { source ->
        log(DEBUG, "getPhotosRoot")
        bridge.getPhotosRoot(
            drivePhotosClientGetPhotosRootRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun enumeratePhotosTimeline(folderUid: String): List<PhotosTimelineItem> = cancellationCoroutineScope { source ->
        log(DEBUG, "enumeratePhotosTimeline")
        bridge.enumeratePhotosTimeline(
            drivePhotosClientEnumeratePhotosTimelineRequest {
                this.folderUid = folderUid
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun getNode(nodeUid: String): NodeResult? = cancellationCoroutineScope { source ->
        log(DEBUG, "getNode")
        bridge.getNode(
            drivePhotosClientGetNodeRequest {
                this.nodeUid = nodeUid
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )?.toEntity()
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
            handle = createFromSession(sessionHandle = handle),
            bridge = this,
        )
    }
