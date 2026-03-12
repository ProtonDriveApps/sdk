package me.proton.drive.sdk.extension

import com.google.protobuf.kotlin.toByteString
import com.google.protobuf.timestamp
import me.proton.drive.sdk.entity.PhotosUploaderRequest
import proton.drive.sdk.additionalMetadataProperty
import proton.drive.sdk.drivePhotosClientGetPhotoUploaderRequest
import proton.drive.sdk.photosFileUploadMetadata

internal fun PhotosUploaderRequest.toProtobuf(
    clientHandle: Long,
    cancellationTokenSourceHandle: Long,
) = drivePhotosClientGetPhotoUploaderRequest {
        this.clientHandle = clientHandle
        name = this@toProtobuf.name
        mediaType = this@toProtobuf.mediaType
        size = this@toProtobuf.fileSize
        metadata = photosFileUploadMetadata {
            this@toProtobuf.captureTime?.let {
                captureTime = it.toTimestamp()
            }
            this@toProtobuf.lastModificationTime?.let {
                lastModificationTime = it.toTimestamp()
            }
            additionalMetadata += this@toProtobuf.additionalMetadata.map { (name, data) ->
                additionalMetadataProperty {
                    this.name = name
                    this.utf8JsonValue = data.toByteString()
                }
            }
            this@toProtobuf.mainPhotoUid?.let {
                mainPhotoUid = it
            }
            tags += this@toProtobuf.tags.map { photoTag ->
                photoTag.toSdkPhotoTag()
            }
        }
        overrideExistingDraftByOtherClient = this@toProtobuf.overrideExistingDraftByOtherClient
        this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
    }
