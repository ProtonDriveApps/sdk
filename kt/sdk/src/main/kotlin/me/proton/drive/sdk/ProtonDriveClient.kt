package me.proton.drive.sdk

import com.google.protobuf.timestamp
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toProto
import me.proton.drive.sdk.internal.JniProtonDriveClient
import me.proton.drive.sdk.internal.cancellationCoroutineScope
import me.proton.drive.sdk.internal.factory
import me.proton.drive.sdk.internal.toLogId
import proton.drive.sdk.driveClientCreateFolderRequest
import proton.drive.sdk.driveClientGetAvailableNameRequest
import proton.drive.sdk.driveClientGetThumbnailsRequest
import proton.drive.sdk.driveClientRenameRequest
import java.nio.channels.WritableByteChannel

class ProtonDriveClient internal constructor(
    internal val handle: Long,
    private val bridge: JniProtonDriveClient,
    session: Session? = null,
) : SdkNode(session), AutoCloseable {

    suspend fun getAvailableName(
        parentFolderUid: String,
        name: String,
    ): String = cancellationCoroutineScope { source ->
        log(DEBUG, "getAvailableName")
        bridge.getAvailableName(
            driveClientGetAvailableNameRequest {
                this.parentFolderUid = parentFolderUid
                this.name = name
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    suspend fun getThumbnails(
        fileUids: List<String>,
        type: ThumbnailType,
        block: (String) -> WritableByteChannel,
    ): Unit = cancellationCoroutineScope { source ->
        log(INFO, "getThumbnails($type)")
        bridge.getThumbnails(
            driveClientGetThumbnailsRequest {
                this.fileUids += fileUids
                this.type = type.toProto()
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).thumbnailsList.forEach { fileThumbnail ->
            block(fileThumbnail.fileUid).use { channel ->
                channel.write(fileThumbnail.data.asReadOnlyByteBuffer())
            }
        }
    }

    suspend fun rename(
        nodeUid: String,
        name: String,
        mediaType: String? = null,
    ): Unit = cancellationCoroutineScope { source ->
        log(DEBUG, "rename")
        bridge.rename(
            driveClientRenameRequest {
                this.nodeUid = nodeUid
                newName = name
                mediaType?.let {
                    newMediaType = mediaType
                }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    suspend fun createFolder(
        parentFolderUid: String,
        name: String,
        lastModification: Long? = null,
    ): FolderNode = cancellationCoroutineScope { source ->
        log(DEBUG, "createFolder")
        bridge.createFolder(
            driveClientCreateFolderRequest {
                this.parentFolderUid = parentFolderUid
                folderName = name
                lastModification?.let {
                    lastModificationTime = timestamp { seconds = lastModification}
                }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override fun close() {
        log(DEBUG, "close")
        bridge.free(handle)
        super.close()
    }

    private fun log(level: LoggerProvider.Level, message: String) {
        bridge.clientLogger(level, "DriveClient(${handle.toLogId()}) $message")
    }
}

suspend fun Session.protonDriveClientCreate(): ProtonDriveClient = factory(JniProtonDriveClient()) {
    ProtonDriveClient(
        session = this@protonDriveClientCreate,
        handle = create(handle),
        bridge = this,
    )
}
