package me.proton.drive.sdk.entity

import java.time.Instant

sealed interface Node {
    val uid: String
    val parentUid: String?
    val treeEventScopeId: String
    val name: String
    val creationTime: Instant
    val trashTime: Instant?
    val nameAuthor: Result<Author>
    val author: Result<Author>
}
