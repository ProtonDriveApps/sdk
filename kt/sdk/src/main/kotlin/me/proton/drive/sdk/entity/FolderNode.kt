package me.proton.drive.sdk.entity

import java.time.Instant

data class FolderNode(
    override val uid: NodeUid,
    override val parentUid: ParentNodeUid?,
    override val treeEventScopeId: ScopeId,
    override val name: String,
    override val creationTime: Instant,
    override val trashTime: Instant?,
    override val nameAuthor: Result<Author>,
    override val author: Result<Author>,
) : Node

