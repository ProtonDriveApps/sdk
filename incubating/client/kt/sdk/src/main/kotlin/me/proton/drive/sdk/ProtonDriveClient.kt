package me.proton.drive.sdk

import kotlinx.coroutines.flow.Flow
import me.proton.drive.sdk.entity.Device
import me.proton.drive.sdk.entity.DeviceType
import me.proton.drive.sdk.entity.DeviceUid
import me.proton.drive.sdk.entity.FileDownloaderRequest
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.NodeUid
import java.time.Instant

interface ProtonDriveClient : ProtonSdkClient {
    suspend fun getAvailableName(parentFolderUid: NodeUid, name: String): String
    suspend fun rename(nodeUid: NodeUid, name: String, mediaType: String? = null)
    suspend fun createFolder(parentFolderUid: NodeUid, name: String, lastModificationTime: Instant? = null): FolderNode
    suspend fun getMyFilesFolder(): FolderNode
    fun enumerateFolderChildren(folderUid: NodeUid): Flow<NodeUid>
    suspend fun downloader(request: FileDownloaderRequest): Downloader
    suspend fun uploader(request: FileUploaderRequest): Uploader
    suspend fun uploader(request: FileRevisionUploaderRequest): Uploader
    fun enumerateDevices(): Flow<Device>
    suspend fun createDevice(name: String, type: DeviceType): Device
    suspend fun renameDevice(deviceUid: DeviceUid, name: String): Device
    suspend fun deleteDevice(deviceUid: DeviceUid)
}

