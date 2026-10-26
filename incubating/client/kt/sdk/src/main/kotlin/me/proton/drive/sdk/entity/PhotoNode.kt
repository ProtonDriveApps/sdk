package me.proton.drive.sdk.entity

import java.time.Instant

data class PhotoNode(
    override val uid: NodeUid,
    override val parentUid: ParentNodeUid?,
    override val treeEventScopeId: ScopeId,
    override val name: Result<String>,
    val mediaType: String,
    override val creationTime: Instant,
    override val trashTime: Instant?,
    override val nameAuthor: Result<Author>,
    override val keyAuthor: Result<Author>,
    override val ownedBy: OwnedBy,
    val activeRevision: FileRevision,
    val totalStorageSize: Long,
    override val isShared: Boolean,
    override val isSharedByUrl: Boolean,
    override val directRole: MemberRole,
    override val membership: Membership?,
    override val errors: List<DriveError>,
    val captureTime: Instant,
    val albumUids: List<NodeUid>,
    @Deprecated("Not part of the public API. Only for backward compatibility with the old Drive client setup.")
    override val deprecatedShareId: String?,
    /** The tags of the photo, for example [PhotoTag.Favorite]. Tags this version does not know are left out. */
    val tags: List<PhotoTag> = emptyList(),
    /** The other parts of a burst, a live photo or a motion photo. */
    val relatedPhotoUids: List<NodeUid> = emptyList(),
    /** Digest of the photo's content, or null when the service has none. */
    val contentHash: ByteArray? = null,
) : Node {

    /** Compares [contentHash] by content, which the generated data class equality would not. */
    override fun equals(other: Any?): Boolean =
        this === other || (other is PhotoNode && equalityKey() == other.equalityKey())

    override fun hashCode(): Int = equalityKey().hashCode()

    // Add every new property to this list too, or equals and hashCode silently ignore it.
    @Suppress("DEPRECATION")
    private fun equalityKey(): List<Any?> = listOf(
        uid,
        parentUid,
        treeEventScopeId,
        name,
        mediaType,
        creationTime,
        trashTime,
        nameAuthor,
        keyAuthor,
        ownedBy,
        activeRevision,
        totalStorageSize,
        isShared,
        isSharedByUrl,
        directRole,
        membership,
        errors,
        captureTime,
        albumUids,
        deprecatedShareId,
        tags,
        relatedPhotoUids,
        contentHash?.toList(),
    )
}
