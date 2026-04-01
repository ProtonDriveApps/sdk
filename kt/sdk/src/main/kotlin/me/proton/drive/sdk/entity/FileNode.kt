package me.proton.drive.sdk.entity

import java.time.Instant

data class FileNode(
    override val uid: NodeUid,
    override val parentUid: ParentNodeUid?,
    override val treeEventScopeId: ScopeId,
    override val name: String,
    val mediaType: String,
    override val creationTime: Instant,
    override val trashTime: Instant?,
    override val nameAuthor: Result<Author>,
    override val author: Result<Author>,
    val activeRevision: FileRevision,
    val totalSizeOnCloudStorage: Long,
) : Node
