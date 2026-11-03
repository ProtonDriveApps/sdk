package me.proton.drive.sdk.entity

import java.time.Instant
import java.time.OffsetDateTime

data class PhotosUploaderRequest(
    val name: String,
    val mediaType: String,
    val fileSize: Long,
    val lastModificationTime: OffsetDateTime?,
    val captureTime: Instant?,
    val mainPhotoUid: String? = null,
    val tags: List<PhotoTag> = emptyList(),
    val overrideExistingDraftByOtherClient: Boolean,
    val additionalMetadata: Map<String, ByteArray> = emptyMap(),
    val noWaiting: Boolean? = null,
)
