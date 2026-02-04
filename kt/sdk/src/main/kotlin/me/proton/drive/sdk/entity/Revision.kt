package me.proton.drive.sdk.entity

data class FileRevision(
    val uid: String,
    val creationTime: Long,
    val sizeOnCloudStorage: Long,
    val claimedSize: Long?,
    val claimedDigests: FileContentDigests,
    val claimedModificationTime: Long?,
    val thumbnails: List<ThumbnailHeader>,
    val additionalClaimedMetadata: List<AdditionalMetadataProperty>?,
    val contentAuthor: Result<Author>?,
)
