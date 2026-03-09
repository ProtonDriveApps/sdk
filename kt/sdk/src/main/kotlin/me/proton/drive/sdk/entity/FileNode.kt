package me.proton.drive.sdk.entity

import java.time.Instant

data class FileNode(
    override val uid: String,
    override val parentUid: String,
    override val treeEventScopeId: String,
    override val name: String,
    val mediaType: String,
    override val creationTime: Instant,
    override val trashTime: Instant?,
    override val nameAuthor: Result<Author>,
    override val author: Result<Author>,
    val activeRevision: FileRevision,
    val totalSizeOnCloudStorage: Long,
) : Node
