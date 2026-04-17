package me.proton.drive.sdk

import kotlinx.coroutines.flow.Flow
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.PhotosTimelineItem
import me.proton.drive.sdk.entity.PhotosUploaderRequest
import kotlin.time.Duration

interface ProtonPhotosClient : ProtonSdkClient {
    fun enumerateTimeline(): Flow<PhotosTimelineItem>
    suspend fun downloader(photoUid: NodeUid, timeout: Duration): Downloader
    suspend fun uploader(request: PhotosUploaderRequest, timeout: Duration): Uploader
}

