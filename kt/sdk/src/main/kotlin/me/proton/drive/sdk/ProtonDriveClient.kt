package me.proton.drive.sdk

import com.google.protobuf.timestamp
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.FileThumbnail
import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.entity.NodeResultPair
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toProto
import me.proton.drive.sdk.extension.toTimestamp
import me.proton.drive.sdk.internal.JniProtonDriveClient
import me.proton.drive.sdk.internal.cancellationCoroutineScope
import me.proton.drive.sdk.internal.factory
import me.proton.drive.sdk.internal.toLogId
import proton.drive.sdk.driveClientCreateFolderRequest
import proton.drive.sdk.driveClientEnumerateFolderChildrenRequest
import proton.drive.sdk.driveClientDeleteNodesRequest
import proton.drive.sdk.driveClientEmptyTrashRequest
import proton.drive.sdk.driveClientEnumerateTrashRequest
import proton.drive.sdk.driveClientGetAvailableNameRequest
import proton.drive.sdk.driveClientGetMyFilesFolderRequest
import proton.drive.sdk.driveClientGetThumbnailsRequest
import proton.drive.sdk.driveClientRenameRequest
import proton.drive.sdk.driveClientRestoreNodesRequest
import proton.drive.sdk.driveClientTrashNodesRequest
import java.nio.channels.WritableByteChannel
import java.time.Instant

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
    ): List<FileThumbnail> = cancellationCoroutineScope { source ->
        log(INFO, "getThumbnails($type)")
        bridge.getThumbnails(
            driveClientGetThumbnailsRequest {
                this.fileUids += fileUids
                this.type = type.toProto()
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).thumbnailsList.map { fileThumbnail ->
            fileThumbnail.toEntity()
        }
    }

    suspend fun rename(
        nodeUid: String,
        name: String,
        mediaType: String? = null,
    ): Unit = cancellationCoroutineScope { source ->
        log(INFO, "rename")
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
        lastModification: Instant? = null,
    ): FolderNode = cancellationCoroutineScope { source ->
        log(INFO, "createFolder")
        bridge.createFolder(
            driveClientCreateFolderRequest {
                this.parentFolderUid = parentFolderUid
                folderName = name
                lastModification?.let {
                    lastModificationTime = lastModification.toTimestamp()
                }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun getMyFilesFolder(): FolderNode = cancellationCoroutineScope { source ->
        log(DEBUG, "getMyFilesFolder")
        bridge.getMyFilesFolder(
            driveClientGetMyFilesFolderRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun enumerateFolderChildren(
        folderUid: String,
    ): List<NodeResult> = cancellationCoroutineScope { source ->
        log(DEBUG, "enumerateFolderChildren")
        bridge.enumerateFolderChildren(
            driveClientEnumerateFolderChildrenRequest {
                this.folderUid = folderUid
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun trashNodes(
        nodeUids: List<String>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "trashNodes(${nodeUids.size} nodes)")
        bridge.trashNodes(
            driveClientTrashNodesRequest {
                this.nodeUids += nodeUids
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun deleteNodes(
        nodeUids: List<String>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "deleteNodes(${nodeUids.size} nodes)")
        bridge.deleteNodes(
            driveClientDeleteNodesRequest {
                this.nodeUids += nodeUids
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun restoreNodes(
        nodeUids: List<String>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "restoreNodes(${nodeUids.size} nodes)")
        bridge.restoreNodes(
            driveClientRestoreNodesRequest {
                this.nodeUids += nodeUids
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun enumerateTrash(): List<NodeResult> = cancellationCoroutineScope { source ->
        log(DEBUG, "enumerateTrash")
        bridge.enumerateTrash(
            driveClientEnumerateTrashRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun emptyTrash(): Unit = cancellationCoroutineScope { source ->
        log(INFO, "emptyTrash")
        bridge.emptyTrash(
            driveClientEmptyTrashRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
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
        handle = createFromSession(sessionHandle = handle),
        bridge = this,
    )
}
