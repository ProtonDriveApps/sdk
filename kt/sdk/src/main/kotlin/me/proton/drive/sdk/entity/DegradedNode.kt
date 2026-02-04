package me.proton.drive.sdk.entity

sealed interface DegradedNode {
    val uid: String
    val parentUid: String?
    val treeEventScopeId: String
    val name: Result<String>
    val creationTime: Long
    val trashTime: Long?
    val nameAuthor: Result<Author>
    val author: Result<Author>
    val errors: List<DriveError>
}
