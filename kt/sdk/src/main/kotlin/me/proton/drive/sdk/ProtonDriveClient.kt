package me.proton.drive.sdk

import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.RevisionUid
import java.time.Instant
import kotlin.time.Duration

interface ProtonDriveClient : ProtonSdkClient {
    suspend fun getAvailableName(parentFolderUid: NodeUid, name: String): String
    suspend fun rename(nodeUid: NodeUid, name: String, mediaType: String? = null)
    suspend fun createFolder(parentFolderUid: NodeUid, name: String, lastModification: Instant? = null): FolderNode
    suspend fun getMyFilesFolder(): FolderNode
    suspend fun enumerateFolderChildren(folderUid: NodeUid): List<NodeResult>
    suspend fun downloader(revisionUid: RevisionUid, timeout: Duration): Downloader
    suspend fun uploader(request: FileUploaderRequest, timeout: Duration): Uploader
    suspend fun uploader(request: FileRevisionUploaderRequest, timeout: Duration): Uploader
}

