package me.proton.drive.sdk.entity

import java.time.Instant

data class AlbumNode(
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
    override val errors: List<DriveError>,
    val photoCount: Long,
    val coverPhotoNodeUid: NodeUid?,
    val lastActivityTime: Instant?,
) : Node
