package me.proton.drive.sdk.entity

import java.time.Instant

data class DegradedFileNode(
    override val uid: NodeUid,
    override val parentUid: ParentNodeUid?,
    override val treeEventScopeId: ScopeId,
    override val name: Result<String>,
    val mediaType: String,
    override val creationTime: Instant,
    override val trashTime: Instant?,
    override val nameAuthor: Result<Author>,
    override val author: Result<Author>,
    val activeRevision: DegradedRevision?,
    val totalStorageQuotaUsage: Long,
    override val errors: List<DriveError>,
) : DegradedNode
