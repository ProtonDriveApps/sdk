package me.proton.drive.sdk.entity

import java.time.Instant

data class FolderNode(
    override val uid: String,
    override val parentUid: String?,
    override val treeEventScopeId: String,
    override val name: String,
    override val creationTime: Instant,
    override val trashTime: Instant?,
    override val nameAuthor: Result<Author>,
    override val author: Result<Author>,
) : Node

