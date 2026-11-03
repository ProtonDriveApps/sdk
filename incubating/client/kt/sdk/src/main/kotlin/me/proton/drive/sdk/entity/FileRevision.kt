package me.proton.drive.sdk.entity

import java.time.Instant
import java.time.OffsetDateTime

data class FileRevision(
    val uid: RevisionUid,
    val state: RevisionState,
    val creationTime: Instant,
    val storageSize: Long,
    val claimedSize: Long?,
    val claimedDigests: FileContentDigests?,
    /** Keeps the UTC offset it was uploaded with; values uploaded before offsets were kept read as UTC. */
    val claimedModificationTime: OffsetDateTime?,
    val thumbnails: List<ThumbnailHeader>,
    val claimedAdditionalMetadata: List<AdditionalMetadataProperty>?,
    val contentAuthor: Result<Author>?,
)
