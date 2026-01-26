package me.proton.drive.sdk.extension

import com.google.protobuf.kotlin.toByteString
import com.google.protobuf.timestamp
import me.proton.drive.sdk.entity.PhotosUploaderRequest
import proton.drive.sdk.additionalMetadataProperty
import proton.drive.sdk.drivePhotosClientGetPhotoUploaderRequest
import proton.drive.sdk.photoFileUploadMetadata

internal fun PhotosUploaderRequest.toProtobuf(
    clientHandle: Long,
    cancellationTokenSourceHandle: Long,
) = drivePhotosClientGetPhotoUploaderRequest {
    this.clientHandle = clientHandle
    name = this@toProtobuf.name
    size = this@toProtobuf.fileSize
    metadata = photoFileUploadMetadata {
        mediaType = this@toProtobuf.mediaType
        this@toProtobuf.captureTime?.let {
            captureTime = timestamp {
                seconds = it
            }
        }
        this@toProtobuf.lastModificationTime?.let {
            lastModificationTime = timestamp {
                seconds = it
            }
        }
        overrideExistingDraftByOtherClient = this@toProtobuf.overrideExistingDraftByOtherClient
        additionalMetadata += this@toProtobuf.additionalMetadata.map { (name, data) ->
            additionalMetadataProperty {
                this.name = name
                this.utf8JsonValue = data.toByteString()
            }
        }
        this@toProtobuf.mainPhotoLinkId?.let {
            mainPhotoLinkId = it
        }
        tags += this@toProtobuf.tags.map { photoTag ->
            photoTag.toSdkPhotoTag()
        }
    }
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
}
