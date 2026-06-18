package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.PhotosDownloaderRequest
import proton.drive.sdk.drivePhotosClientGetPhotoDownloaderRequest

internal fun PhotosDownloaderRequest.toProtobuf(
    clientHandle: Long,
    cancellationTokenSourceHandle: Long,
) = drivePhotosClientGetPhotoDownloaderRequest {
    this.clientHandle = clientHandle
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
    this.photoUid = this@toProtobuf.nodeUid.value
    this@toProtobuf.noWaiting?.let { noWaiting = it }
}
