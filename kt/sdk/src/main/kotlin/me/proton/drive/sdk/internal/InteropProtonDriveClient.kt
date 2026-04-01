package me.proton.drive.sdk.internal

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.withTimeout
import me.proton.drive.sdk.Downloader
import me.proton.drive.sdk.FileDownloader
import me.proton.drive.sdk.FileUploader
import me.proton.drive.sdk.LoggerProvider
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveClient
import me.proton.drive.sdk.SdkNode
import me.proton.drive.sdk.Session
import me.proton.drive.sdk.Uploader
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileThumbnail
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.entity.NodeResultPair
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.RevisionUid
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toProto
import me.proton.drive.sdk.extension.toTimestamp
import proton.drive.sdk.driveClientCreateFolderRequest
import proton.drive.sdk.driveClientDeleteNodesRequest
import proton.drive.sdk.driveClientEmptyTrashRequest
import proton.drive.sdk.driveClientEnumerateFolderChildrenRequest
import proton.drive.sdk.driveClientEnumerateThumbnailsRequest
import proton.drive.sdk.driveClientEnumerateTrashRequest
import proton.drive.sdk.driveClientGetAvailableNameRequest
import proton.drive.sdk.driveClientGetMyFilesFolderRequest
import proton.drive.sdk.driveClientRenameRequest
import proton.drive.sdk.driveClientRestoreNodesRequest
import proton.drive.sdk.driveClientTrashNodesRequest
import java.time.Instant
import kotlin.time.Duration

internal class InteropProtonDriveClient internal constructor(
    internal val handle: Long,
    private val bridge: JniProtonDriveClient,
    session: Session? = null,
) : SdkNode(session), ProtonDriveClient {

    override suspend fun getAvailableName(
        parentFolderUid: NodeUid,
        name: String,
    ): String = cancellationCoroutineScope { source ->
        log(DEBUG, "getAvailableName")
        bridge.getAvailableName(
            driveClientGetAvailableNameRequest {
                this.parentFolderUid = parentFolderUid.value
                this.name = name
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    override fun enumerateThumbnails(
        nodeUids: List<NodeUid>,
        type: ThumbnailType,
    ): Flow<FileThumbnail> = channelFlow {
        log(INFO, "enumerateThumbnails(${nodeUids.size}, $type)")
        cancellationCoroutineScope { source ->
            bridge.enumerateThumbnails(
                coroutineScope = this@channelFlow,
                request = driveClientEnumerateThumbnailsRequest {
                    this.fileUids += nodeUids.map { it.value }
                    this.type = type.toProto()
                    clientHandle = handle
                    cancellationTokenSourceHandle = source.handle
                    yieldAction = ProtonDriveSdkNativeClient.getYieldPointer()
                },
                yield = { fileThumbnail ->
                    send(fileThumbnail.toEntity())
                }
            )
        }
    }

    override suspend fun rename(
        nodeUid: NodeUid,
        name: String,
        mediaType: String?,
    ): Unit = cancellationCoroutineScope { source ->
        log(INFO, "rename")
        bridge.rename(
            driveClientRenameRequest {
                this.nodeUid = nodeUid.value
                newName = name
                mediaType?.let {
                    newMediaType = mediaType
                }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    override suspend fun createFolder(
        parentFolderUid: NodeUid,
        name: String,
        lastModification: Instant?,
    ): FolderNode = cancellationCoroutineScope { source ->
        log(INFO, "createFolder")
        bridge.createFolder(
            driveClientCreateFolderRequest {
                this.parentFolderUid = parentFolderUid.value
                folderName = name
                lastModification?.let {
                    lastModificationTime = lastModification.toTimestamp()
                }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override suspend fun getMyFilesFolder(): FolderNode = cancellationCoroutineScope { source ->
        log(DEBUG, "getMyFilesFolder")
        bridge.getMyFilesFolder(
            driveClientGetMyFilesFolderRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override fun enumerateFolderChildren(
        folderUid: NodeUid,
    ): Flow<NodeResult> = channelFlow {
        log(DEBUG, "enumerateFolderChildren")
        cancellationCoroutineScope { source ->
            bridge.enumerateFolderChildren(
                coroutineScope = this@channelFlow,
                request = driveClientEnumerateFolderChildrenRequest {
                    this.folderUid = folderUid.value
                    clientHandle = handle
                    cancellationTokenSourceHandle = source.handle
                    yieldAction = ProtonDriveSdkNativeClient.getYieldPointer()
                },
                yield = { nodeResult ->
                    send(nodeResult.toEntity())
                }
            )
        }
    }

    override suspend fun trashNodes(
        nodeUids: List<NodeUid>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "trashNodes(${nodeUids.size} nodes)")
        bridge.trashNodes(
            driveClientTrashNodesRequest {
                this.nodeUids += nodeUids.map { it.value }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override suspend fun deleteNodes(
        nodeUids: List<NodeUid>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "deleteNodes(${nodeUids.size} nodes)")
        bridge.deleteNodes(
            driveClientDeleteNodesRequest {
                this.nodeUids += nodeUids.map { it.value }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override suspend fun restoreNodes(
        nodeUids: List<NodeUid>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "restoreNodes(${nodeUids.size} nodes)")
        bridge.restoreNodes(
            driveClientRestoreNodesRequest {
                this.nodeUids += nodeUids.map { it.value }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override fun enumerateTrash(): Flow<NodeResult> = channelFlow {
        log(DEBUG, "enumerateTrash")
        cancellationCoroutineScope { source ->
            bridge.enumerateTrash(
                coroutineScope = this@channelFlow,
                request = driveClientEnumerateTrashRequest {
                    clientHandle = handle
                    cancellationTokenSourceHandle = source.handle
                    yieldAction = ProtonDriveSdkNativeClient.getYieldPointer()
                },
                yield = { nodeResult ->
                    send(nodeResult.toEntity())
                }
            )
        }
    }

    override suspend fun emptyTrash(): Unit = cancellationCoroutineScope { source ->
        log(INFO, "emptyTrash")
        bridge.emptyTrash(
            driveClientEmptyTrashRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    override suspend fun downloader(
        revisionUid: RevisionUid,
        timeout: Duration,
    ): Downloader = withTimeout(timeout) {
        cancellationCoroutineScope { source ->
            factory(JniFileDownloader()) {
                FileDownloader(
                    client = this@InteropProtonDriveClient,
                    handle = getFileDownloader(
                        clientHandle = handle,
                        cancellationTokenSourceHandle = source.handle,
                        revisionUid = revisionUid,
                    ),
                    bridge = this,
                    cancellationTokenSource = source,
                )
            }
        }
    }

    override suspend fun uploader(
        request: FileUploaderRequest,
        timeout: Duration,
    ): Uploader = withTimeout(timeout) {
        cancellationCoroutineScope { source ->
            JniFileUploader().run {
                FileUploader(
                    client = this@InteropProtonDriveClient,
                    handle = getFileUploader(
                        clientHandle = handle,
                        cancellationTokenSourceHandle = source.handle,
                        request = request,
                    ),
                    bridge = this,
                    cancellationTokenSource = source,
                )
            }
        }
    }

    override suspend fun uploader(
        request: FileRevisionUploaderRequest,
        timeout: Duration,
    ): Uploader = withTimeout(timeout) {
        cancellationCoroutineScope { source ->
            JniFileUploader().run {
                FileUploader(
                    client = this@InteropProtonDriveClient,
                    handle = getFileRevisionUploader(
                        clientHandle = handle,
                        cancellationTokenSourceHandle = source.handle,
                        request = request,
                    ),
                    bridge = this,
                    cancellationTokenSource = source,
                )
            }
        }
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
