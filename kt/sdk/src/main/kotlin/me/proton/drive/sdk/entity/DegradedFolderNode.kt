package me.proton.drive.sdk.entity

data class DegradedFolderNode(
    override val uid: String,
    override val parentUid: String?,
    override val treeEventScopeId: String,
    override val name: Result<String>,
    override val creationTime: Long,
    override val trashTime: Long?,
    override val nameAuthor: Result<Author>,
    override val author: Result<Author>,
    override val errors: List<DriveError>,
) : DegradedNode
