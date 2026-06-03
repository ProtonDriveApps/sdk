package me.proton.drive.sdk

import kotlinx.coroutines.flow.Flow
import me.proton.drive.sdk.entity.PhotosDownloaderRequest
import me.proton.drive.sdk.entity.PhotosTimelineItem
import me.proton.drive.sdk.entity.PhotosUploaderRequest

interface ProtonPhotosClient : ProtonSdkClient {
    fun enumerateTimeline(): Flow<PhotosTimelineItem>
    suspend fun downloader(request: PhotosDownloaderRequest): Downloader
    suspend fun uploader(request: PhotosUploaderRequest): Uploader
}

