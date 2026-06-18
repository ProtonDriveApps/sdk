package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import proton.drive.sdk.driveClientGetFileRevisionUploaderRequest

internal fun FileRevisionUploaderRequest.toProtobuf(
    clientHandle: Long,
    cancellationTokenSourceHandle: Long,
) = driveClientGetFileRevisionUploaderRequest {
    this.clientHandle = clientHandle
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
    this.currentActiveRevisionUid = this@toProtobuf.currentActiveRevisionUid.value
    this.size = this@toProtobuf.size
    this@toProtobuf.lastModificationTime?.toTimestamp()?.let { lastModificationTime = it }
    this@toProtobuf.noWaiting?.let { noWaiting = it }
}
