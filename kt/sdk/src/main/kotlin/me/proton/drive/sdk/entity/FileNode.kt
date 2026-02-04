package me.proton.drive.sdk.entity

data class FileNode(
    override val uid: String,
    override val parentUid: String,
    override val treeEventScopeId: String,
    override val name: String,
    val mediaType: String,
    override val creationTime: Long,
    override val trashTime: Long?,
    override val nameAuthor: Result<Author>,
    override val author: Result<Author>,
    val activeRevision: FileRevision,
    val totalSizeOnCloudStorage: Long,
) : Node
