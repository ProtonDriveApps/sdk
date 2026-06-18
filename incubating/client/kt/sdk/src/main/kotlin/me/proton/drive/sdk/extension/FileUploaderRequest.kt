package me.proton.drive.sdk.extension

import com.google.protobuf.kotlin.toByteString
import me.proton.drive.sdk.entity.FileUploaderRequest
import proton.drive.sdk.additionalMetadataProperty
import proton.drive.sdk.driveClientGetFileUploaderRequest

internal fun FileUploaderRequest.toProtobuf(
    clientHandle: Long,
    cancellationTokenSourceHandle: Long,
) = driveClientGetFileUploaderRequest {
    name = this@toProtobuf.name
    mediaType = this@toProtobuf.mediaType
    size = this@toProtobuf.fileSize
    parentFolderUid = this@toProtobuf.parentFolderUid.value
    this@toProtobuf.lastModificationTime?.toTimestamp()?.let { lastModificationTime = it }
    overrideExistingDraftByOtherClient = this@toProtobuf.overrideExistingDraftByOtherClient
    additionalMetadata += this@toProtobuf.additionalMetadata.map { (name, data) ->
        additionalMetadataProperty {
            this.name = name
            this.utf8JsonValue = data.toByteString()
        }
    }
    this@toProtobuf.noWaiting?.let { noWaiting = it }
    this.clientHandle = clientHandle
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
}
