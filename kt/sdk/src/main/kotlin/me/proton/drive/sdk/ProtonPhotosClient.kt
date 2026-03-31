package me.proton.drive.sdk

import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.PhotosTimelineItem
import me.proton.drive.sdk.entity.PhotosUploaderRequest
import kotlin.time.Duration

interface ProtonPhotosClient : ProtonSdkClient {
    suspend fun enumerateTimeline(): List<PhotosTimelineItem>
    suspend fun getNode(nodeUid: NodeUid): NodeResult?
    suspend fun downloader(photoUid: NodeUid, timeout: Duration): Downloader
    suspend fun uploader(request: PhotosUploaderRequest, timeout: Duration): Uploader
}

