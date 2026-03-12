package me.proton.drive.sdk.entity

import java.time.Instant

data class PhotosUploaderRequest(
    val name: String,
    val mediaType: String,
    val fileSize: Long,
    val lastModificationTime: Instant?, // optional
    val captureTime: Instant?, // optional
    val mainPhotoUid: String? = null, // optional
    val tags: List<PhotoTag> = emptyList(),  // optional
    val overrideExistingDraftByOtherClient: Boolean,
    val additionalMetadata: Map<String, ByteArray> = emptyMap(),  // optional
)
