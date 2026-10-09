package me.proton.drive.sdk

import kotlinx.coroutines.flow.Flow
import me.proton.drive.sdk.entity.AlbumItem
import me.proton.drive.sdk.entity.AlbumNode
import me.proton.drive.sdk.entity.DriveEvent
import me.proton.drive.sdk.entity.DriveEventId
import me.proton.drive.sdk.entity.NodeResultPair
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.PhotoTagsUpdate
import me.proton.drive.sdk.entity.PhotosDownloaderRequest
import me.proton.drive.sdk.entity.PhotosTimelineItem
import me.proton.drive.sdk.entity.PhotosUploaderRequest
import me.proton.drive.sdk.entity.ScopeId

interface ProtonPhotosClient : ProtonSdkClient {
    fun enumerateTimeline(): Flow<PhotosTimelineItem>
    fun enumerateEvents(scopeId: ScopeId, cursorEventId: DriveEventId? = null): Flow<DriveEvent>
    fun enumerateAlbumNodeUids(): Flow<NodeUid>
    fun enumerateAlbum(albumUid: NodeUid): Flow<AlbumItem>
    fun enumerateSharedWithMeNodeUids(): Flow<NodeUid>
    suspend fun downloader(request: PhotosDownloaderRequest): Downloader
    suspend fun uploader(request: PhotosUploaderRequest): Uploader
    suspend fun findPhotoDuplicates(name: String, generateSha1: suspend () -> ByteArray): List<NodeUid>
    fun updatePhotos(updates: List<PhotoTagsUpdate>): Flow<NodeResultPair>
    fun savePhotosToTimeline(photoUids: List<NodeUid>): Flow<NodeResultPair>
    fun addPhotosToAlbum(albumUid: NodeUid, photoUids: List<NodeUid>): Flow<NodeResultPair>
    suspend fun deleteAlbum(albumUid: NodeUid, force: Boolean = false, saveToTimeline: Boolean = false)
    suspend fun createAlbum(name: String): AlbumNode
    fun removePhotosFromAlbum(albumUid: NodeUid, photoUids: List<NodeUid>): Flow<NodeResultPair>
    suspend fun updateAlbum(albumUid: NodeUid, name: String? = null, coverPhotoUid: NodeUid? = null): AlbumNode
}

