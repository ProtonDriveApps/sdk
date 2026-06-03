package me.proton.drive.sdk

import kotlinx.coroutines.flow.Flow
import me.proton.drive.sdk.entity.FileDownloaderRequest
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.Node
import me.proton.drive.sdk.entity.NodeUid
import java.time.Instant

interface ProtonDriveClient : ProtonSdkClient {
    suspend fun getAvailableName(parentFolderUid: NodeUid, name: String): String
    suspend fun rename(nodeUid: NodeUid, name: String, mediaType: String? = null)
    suspend fun createFolder(parentFolderUid: NodeUid, name: String, lastModification: Instant? = null): FolderNode
    suspend fun getMyFilesFolder(): FolderNode
    fun enumerateFolderChildren(folderUid: NodeUid): Flow<Node>
    suspend fun downloader(request: FileDownloaderRequest): Downloader
    suspend fun uploader(request: FileUploaderRequest): Uploader
    suspend fun uploader(request: FileRevisionUploaderRequest): Uploader
}

