package me.proton.drive.sdk.entity

sealed interface Node {
    val uid: String
    val parentUid: String?
    val treeEventScopeId: String
    val name: String
    val creationTime: Long
    val trashTime: Long?
    val nameAuthor: Result<Author>
    val author: Result<Author>
}
