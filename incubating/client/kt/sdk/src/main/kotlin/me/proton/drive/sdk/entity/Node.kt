package me.proton.drive.sdk.entity

import java.time.Instant

sealed interface Node {
    val uid: NodeUid
    val parentUid: ParentNodeUid?
    val treeEventScopeId: ScopeId
    val name: Result<String>
    val creationTime: Instant
    val trashTime: Instant?
    val nameAuthor: Result<Author>
    val keyAuthor: Result<Author>
    val ownedBy: OwnedBy
    val isShared: Boolean
    val isSharedByUrl: Boolean
    val directRole: MemberRole
    val membership: Membership?
    val errors: List<DriveError>

    /**
     * The ID of the share this node is shared with; null when it is not shared.
     *
     * Only exists for backward compatibility with the old Drive client setup. An application keyed by root share
     * has to traverse to the root itself and read the value from there.
     */
    @Deprecated("Not part of the public API. Only for backward compatibility with the old Drive client setup.")
    val deprecatedShareId: String?
}
