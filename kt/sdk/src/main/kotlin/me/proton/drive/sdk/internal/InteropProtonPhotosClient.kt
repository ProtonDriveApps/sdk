package me.proton.drive.sdk.internal

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.withTimeout
import me.proton.drive.sdk.Downloader
import me.proton.drive.sdk.LoggerProvider
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.PhotosDownloader
import me.proton.drive.sdk.PhotosUploader
import me.proton.drive.sdk.ProtonPhotosClient
import me.proton.drive.sdk.SdkNode
import me.proton.drive.sdk.Session
import me.proton.drive.sdk.Uploader
import me.proton.drive.sdk.entity.FileThumbnail
import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.entity.NodeResultPair
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.PhotosTimelineItem
import me.proton.drive.sdk.entity.PhotosUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toProto
import proton.drive.sdk.drivePhotosClientDeleteNodesRequest
import proton.drive.sdk.drivePhotosClientEmptyTrashRequest
import proton.drive.sdk.drivePhotosClientEnumerateThumbnailsRequest
import proton.drive.sdk.drivePhotosClientEnumerateTimelineRequest
import proton.drive.sdk.drivePhotosClientEnumerateTrashRequest
import proton.drive.sdk.drivePhotosClientGetNodeRequest
import proton.drive.sdk.drivePhotosClientRestoreNodesRequest
import proton.drive.sdk.drivePhotosClientTrashNodesRequest
import kotlin.time.Duration

internal class InteropProtonPhotosClient internal constructor(
    internal val handle: Long,
    private val bridge: JniProtonPhotosClient,
    session: Session? = null,
) : SdkNode(session), ProtonPhotosClient {

    override fun enumerateThumbnails(
        nodeUids: List<NodeUid>,
        type: ThumbnailType,
    ): Flow<FileThumbnail> = channelFlow {
        log(INFO, "enumerateThumbnails(${nodeUids.size}, $type)")
        cancellationCoroutineScope { source ->
            bridge.enumerateThumbnails(
                coroutineScope = this@channelFlow,
                request = drivePhotosClientEnumerateThumbnailsRequest {
                    this.photoUids += nodeUids.map { it.value }
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

    override suspend fun enumerateTimeline(): List<PhotosTimelineItem> = cancellationCoroutineScope { source ->
        log(DEBUG, "enumerateTimeline")
        bridge.enumerateTimeline(
            drivePhotosClientEnumerateTimelineRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override suspend fun getNode(nodeUid: NodeUid): NodeResult? = cancellationCoroutineScope { source ->
        log(DEBUG, "getNode")
        bridge.getNode(
            drivePhotosClientGetNodeRequest {
                this.nodeUid = nodeUid.value
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )?.toEntity()
    }

    override suspend fun trashNodes(
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

    override suspend fun deleteNodes(
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

    override suspend fun restoreNodes(
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

    override fun enumerateTrash(): Flow<NodeResult> = channelFlow {
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

    override suspend fun emptyTrash(): Unit = cancellationCoroutineScope { source ->
        log(INFO, "emptyTrash")
        bridge.emptyTrash(
            drivePhotosClientEmptyTrashRequest {
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    override suspend fun downloader(
        photoUid: NodeUid,
        timeout: Duration,
    ): Downloader = withTimeout(timeout) {
        cancellationCoroutineScope { source ->
            factory(JniPhotosDownloader()) {
                PhotosDownloader(
                    client = this@InteropProtonPhotosClient,
                    handle = getPhotoDownloader(
                        clientHandle = handle,
                        cancellationTokenSourceHandle = source.handle,
                        photoUid = photoUid,
                    ),
                    bridge = this,
                    cancellationTokenSource = source,
                )
            }
        }
    }

    override suspend fun uploader(
        request: PhotosUploaderRequest,
        timeout: Duration,
    ): Uploader = withTimeout(timeout) {
        cancellationCoroutineScope { source ->
            JniPhotosUploader().run {
                PhotosUploader(
                    client = this@InteropProtonPhotosClient,
                    handle = getPhotoUploader(
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
        bridge.clientLogger(level, "ProtonPhotosClient(${handle.toLogId()}) $message")
    }
}
