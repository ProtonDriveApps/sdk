package me.proton.drive.sdk.internal

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import me.proton.drive.sdk.Downloader
import me.proton.drive.sdk.FileDownloader
import me.proton.drive.sdk.FileUploader
import me.proton.drive.sdk.LoggerProvider
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.INFO
import me.proton.drive.sdk.ProtonDriveClient
import me.proton.drive.sdk.SdkNode
import me.proton.drive.sdk.Uploader
import me.proton.drive.sdk.entity.Device
import me.proton.drive.sdk.entity.DeviceType
import me.proton.drive.sdk.entity.DeviceUid
import me.proton.drive.sdk.entity.FileDownloaderRequest
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileThumbnail
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.Node
import me.proton.drive.sdk.entity.NodeResultPair
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.extension.toProto
import me.proton.drive.sdk.extension.toTimestamp
import proton.drive.sdk.driveClientCreateDeviceRequest
import proton.drive.sdk.driveClientCreateFolderRequest
import proton.drive.sdk.driveClientDeleteDeviceRequest
import proton.drive.sdk.driveClientDeleteNodesRequest
import proton.drive.sdk.driveClientEmptyTrashRequest
import proton.drive.sdk.driveClientEnumerateDevicesRequest
import proton.drive.sdk.driveClientEnumerateFolderChildrenRequest
import proton.drive.sdk.driveClientEnumerateThumbnailsRequest
import proton.drive.sdk.driveClientEnumerateTrashRequest
import proton.drive.sdk.driveClientGetAvailableNameRequest
import proton.drive.sdk.driveClientGetMyFilesFolderRequest
import proton.drive.sdk.driveClientGetNodeRequest
import proton.drive.sdk.driveClientRenameDeviceRequest
import proton.drive.sdk.driveClientRenameRequest
import proton.drive.sdk.driveClientRestoreNodesRequest
import proton.drive.sdk.driveClientTrashNodesRequest
import java.time.Instant

internal class InteropProtonDriveClient internal constructor(
    internal val handle: Long,
    private val bridge: JniProtonDriveClient,
) : SdkNode(null), ProtonDriveClient {

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
        lastModificationTime: Instant?,
    ): FolderNode = cancellationCoroutineScope { source ->
        log(INFO, "createFolder")
        bridge.createFolder(
            driveClientCreateFolderRequest {
                this.parentFolderUid = parentFolderUid.value
                folderName = name
                lastModificationTime?.toTimestamp()?.let { this.lastModificationTime = it }
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
    ): Flow<NodeUid> = channelFlow {
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
                yield = { nodeUid ->
                    send(NodeUid(nodeUid.value))
                }
            )
        }
    }

    override suspend fun getNode(
        nodeUid: NodeUid,
    ): Node? = cancellationCoroutineScope { source ->
        log(DEBUG, "getNode")
        bridge.getNode(
            driveClientGetNodeRequest {
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

    override fun enumerateTrash(): Flow<NodeUid> = channelFlow {
        log(DEBUG, "enumerateTrash")
        cancellationCoroutineScope { source ->
            bridge.enumerateTrash(
                coroutineScope = this@channelFlow,
                request = driveClientEnumerateTrashRequest {
                    clientHandle = handle
                    cancellationTokenSourceHandle = source.handle
                    yieldAction = ProtonDriveSdkNativeClient.getYieldPointer()
                },
                yield = { nodeUid ->
                    send(NodeUid(nodeUid.value))
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

    override fun enumerateDevices(): Flow<Device> = channelFlow {
        log(DEBUG, "enumerateDevices")
        cancellationCoroutineScope { source ->
            bridge.enumerateDevices(
                coroutineScope = this@channelFlow,
                request = driveClientEnumerateDevicesRequest {
                    clientHandle = handle
                    cancellationTokenSourceHandle = source.handle
                    yieldAction = ProtonDriveSdkNativeClient.getYieldPointer()
                },
                yield = { device ->
                    send(device.toEntity())
                }
            )
        }
    }

    override suspend fun createDevice(
        name: String,
        type: DeviceType,
    ): Device = cancellationCoroutineScope { source ->
        log(INFO, "createDevice")
        bridge.createDevice(
            driveClientCreateDeviceRequest {
                this.name = name
                deviceType = type.toProto()
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override suspend fun renameDevice(
        deviceUid: DeviceUid,
        name: String,
    ): Device = cancellationCoroutineScope { source ->
        log(INFO, "renameDevice")
        bridge.renameDevice(
            driveClientRenameDeviceRequest {
                this.deviceUid = deviceUid.value
                this.name = name
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).toEntity()
    }

    override suspend fun deleteDevice(
        deviceUid: DeviceUid,
    ): Unit = cancellationCoroutineScope { source ->
        log(INFO, "deleteDevice")
        bridge.deleteDevice(
            driveClientDeleteDeviceRequest {
                this.deviceUid = deviceUid.value
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    override suspend fun downloader(
        request: FileDownloaderRequest,
    ): Downloader {
        log(INFO, "downloader")
        return cancellationCoroutineScope { source ->
            factory(JniFileDownloader()) {
                FileDownloader(
                    client = this@InteropProtonDriveClient,
                    handle = getFileDownloader(
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
        request: FileUploaderRequest,
    ): Uploader {
        log(INFO, "fileUploader")
        return cancellationCoroutineScope { source ->
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
    ): Uploader {
        log(INFO, "fileRevisionUploader")
        return cancellationCoroutineScope { source ->
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
