package me.proton.drive.sdk.entity

import java.time.Instant

data class FolderNode(
    override val uid: NodeUid,
    override val parentUid: ParentNodeUid?,
    override val treeEventScopeId: ScopeId,
    override val name: Result<String>,
    override val creationTime: Instant,
    override val trashTime: Instant?,
    override val nameAuthor: Result<Author>,
    override val keyAuthor: Result<Author>,
    override val ownedBy: OwnedBy,
    override val isShared: Boolean,
    override val isSharedByUrl: Boolean,
    override val directRole: MemberRole,
    override val membership: Membership?,
    override val errors: List<DriveError>,
    @Deprecated("Not part of the public API. Only for backward compatibility with the old Drive client setup.")
    override val deprecatedShareId: String?,
) : Node
