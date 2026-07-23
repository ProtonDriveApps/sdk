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
    override val isSharedPublicly: Boolean,
    override val errors: List<DriveError>,
    val captureTime: Instant,
    val albumUids: List<NodeUid>,
) : Node
