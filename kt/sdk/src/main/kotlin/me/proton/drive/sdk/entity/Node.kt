package me.proton.drive.sdk.entity

import java.time.Instant

sealed interface Node {
    val uid: NodeUid
    val parentUid: ParentNodeUid?
    val treeEventScopeId: ScopeId
    val name: String
    val creationTime: Instant
    val trashTime: Instant?
    val nameAuthor: Result<Author>
    val author: Result<Author>
}
