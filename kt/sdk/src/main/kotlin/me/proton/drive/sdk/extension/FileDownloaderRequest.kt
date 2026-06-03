package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.FileDownloaderRequest
import proton.drive.sdk.driveClientGetFileDownloaderRequest

internal fun FileDownloaderRequest.toProtobuf(
    clientHandle: Long,
    cancellationTokenSourceHandle: Long,
) = driveClientGetFileDownloaderRequest {
    this.clientHandle = clientHandle
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
    this.revisionUid = this@toProtobuf.revisionUid.value
    this@toProtobuf.noWaiting?.let { noWaiting = it }
}
