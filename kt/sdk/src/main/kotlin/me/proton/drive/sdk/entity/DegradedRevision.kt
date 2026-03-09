package me.proton.drive.sdk.entity

import java.time.Instant

data class DegradedRevision(
    val uid: String,
    val creationTime: Instant,
    val sizeOnCloudStorage: Long,
    val claimedSize: Long?,
    val claimedDigests: FileContentDigests?,
    val claimedModificationTime: Instant?,
    val thumbnails: List<ThumbnailHeader>,
    val additionalClaimedMetadata: List<AdditionalMetadataProperty>?,
    val contentAuthor: Result<Author>?,
    val canDecrypt: Boolean,
    val errors: List<DriveError>,
)
