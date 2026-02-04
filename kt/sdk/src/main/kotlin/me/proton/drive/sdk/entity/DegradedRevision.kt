package me.proton.drive.sdk.entity

data class DegradedRevision(
    val uid: String,
    val creationTime: Long,
    val sizeOnCloudStorage: Long,
    val claimedSize: Long?,
    val claimedDigests: FileContentDigests?,
    val claimedModificationTime: Long?,
    val thumbnails: List<ThumbnailHeader>,
    val additionalClaimedMetadata: List<AdditionalMetadataProperty>?,
    val contentAuthor: Result<Author>?,
    val canDecrypt: Boolean,
    val errors: List<DriveError>,
)
