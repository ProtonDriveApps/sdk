package me.proton.drive.sdk

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.entity.FileThumbnail
import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.entity.NodeResultPair
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.PhotosTimelineItem
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toProto
import me.proton.drive.sdk.internal.JniProtonPhotosClient
import me.proton.drive.sdk.internal.ProtonDriveSdkNativeClient
import me.proton.drive.sdk.internal.cancellationCoroutineScope
import me.proton.drive.sdk.internal.factory
import me.proton.drive.sdk.internal.toLogId
import proton.drive.sdk.drivePhotosClientDeleteNodesRequest
import proton.drive.sdk.drivePhotosClientEmptyTrashRequest
import proton.drive.sdk.drivePhotosClientEnumerateThumbnailsRequest
import proton.drive.sdk.drivePhotosClientEnumerateTimelineRequest
import proton.drive.sdk.drivePhotosClientEnumerateTrashRequest
import proton.drive.sdk.drivePhotosClientGetNodeRequest
import proton.drive.sdk.drivePhotosClientRestoreNodesRequest
import proton.drive.sdk.drivePhotosClientTrashNodesRequest

class ProtonPhotosClient internal constructor(
    internal val handle: Long,
    private val bridge: JniProtonPhotosClient,
    session: Session? = null,
) : SdkNode(session), AutoCloseable {

    fun enumerateThumbnails(
        photoUids: List<NodeUid>,
        type: ThumbnailType,
    ): Flow<FileThumbnail> = channelFlow {
        log(INFO, "enumerateThumbnails(${photoUids.size}, $type)")
        cancellationCoroutineScope { source ->
            bridge.enumerateThumbnails(
                coroutineScope = this@channelFlow,
                request = drivePhotosClientEnumerateThumbnailsRequest {
                    this.photoUids += photoUids.map { it.value }
                    this.type = type.toProto()
                    clientHandle = handle
                    cancellationTokenSourceHandle = source.handle
                    iterateAction = ProtonDriveSdkNativeClient.getEnumeratePointer()
                },
                enumerate = { fileThumbnail ->
                    send(fileThumbnail.toEntity())
                }
            )
        }
    }

    suspend fun enumerateTimeline(): List<PhotosTimelineItem> = cancellationCoroutineScope { source ->
        log(DEBUG, "enumerateTimeline")
        bridge.enumerateTimeline(
            drivePhotosClientEnumerateTimelineRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun getNode(nodeUid: NodeUid): NodeResult? = cancellationCoroutineScope { source ->
        log(DEBUG, "getNode")
        bridge.getNode(
            drivePhotosClientGetNodeRequest {
                this.nodeUid = nodeUid.value
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )?.toEntity()
    }

    suspend fun trashNodes(
        nodeUids: List<NodeUid>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "trashNodes(${nodeUids.size} nodes)")
        bridge.trashNodes(
            drivePhotosClientTrashNodesRequest {
                this.nodeUids += nodeUids.map { it.value }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun deleteNodes(
        nodeUids: List<NodeUid>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "deleteNodes(${nodeUids.size} nodes)")
        bridge.deleteNodes(
            drivePhotosClientDeleteNodesRequest {
                this.nodeUids += nodeUids.map { it.value }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    suspend fun restoreNodes(
        nodeUids: List<NodeUid>,
    ): List<NodeResultPair> = cancellationCoroutineScope { source ->
        log(INFO, "restoreNodes(${nodeUids.size} nodes)")
        bridge.restoreNodes(
            drivePhotosClientRestoreNodesRequest {
                this.nodeUids += nodeUids.map { it.value }
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    fun enumerateTrash(): Flow<NodeResult> = channelFlow {
        log(DEBUG, "enumerateTrash")
        cancellationCoroutineScope { source ->
            bridge.enumerateTrash(
                coroutineScope = this@channelFlow,
                drivePhotosClientEnumerateTrashRequest {
                    clientHandle = handle
                    cancellationTokenSourceHandle = source.handle
                    iterateAction = ProtonDriveSdkNativeClient.getEnumeratePointer()
                },
                enumerate = { nodeResult ->
                    send(nodeResult.toEntity())
                }
            )
        }
    }

    suspend fun emptyTrash(): Unit = cancellationCoroutineScope { source ->
        log(INFO, "emptyTrash")
        bridge.emptyTrash(
            drivePhotosClientEmptyTrashRequest {
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
