package me.proton.drive.sdk.entity

data class PhotosUploaderRequest(
    val name: String,
    val mediaType: String,
    val fileSize: Long,
    val lastModificationTime: Long?, // optional
    val captureTime: Long?, // optional
    val mainPhotoLinkId: String?, // optional
    val tags: List<PhotoTag> = emptyList(),  // optional
    val overrideExistingDraftByOtherClient: Boolean,
    val additionalMetadata: Map<String, ByteArray> = emptyMap(),  // optional
)
