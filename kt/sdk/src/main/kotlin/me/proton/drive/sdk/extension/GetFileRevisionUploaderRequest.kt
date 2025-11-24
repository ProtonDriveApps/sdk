package me.proton.drive.sdk.extension

import com.google.protobuf.timestamp
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import proton.drive.sdk.driveClientGetFileRevisionUploaderRequest

internal fun FileRevisionUploaderRequest.toProtobuf(
    clientHandle: Long,
    cancellationTokenSourceHandle: Long,
) = driveClientGetFileRevisionUploaderRequest {
    this.clientHandle = clientHandle
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
    this.currentActiveRevisionUid = this@toProtobuf.currentActiveRevisionUid
    this.size = this@toProtobuf.size
    this.lastModificationTime = timestamp { seconds = this@toProtobuf.lastModificationTime }
}
