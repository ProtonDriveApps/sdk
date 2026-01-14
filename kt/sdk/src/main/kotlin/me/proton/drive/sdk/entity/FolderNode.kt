package me.proton.drive.sdk.entity

data class FolderNode(
    var uid: String,
    var parentUid: String?,
    var treeEventScopeId: String,
    var name: String,
    var creationTime: Long,
    var trashTime: Long?,
    var nameAuthor: AuthorResult,
    var author: AuthorResult,
)

