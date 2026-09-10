package me.proton.drive.sdk.entity

data class NodeMoveItem(
    val nodeUid: NodeUid,
    val currentParentUid: NodeUid,
    val currentName: String,
    val targetName: String,
    val newMediaType: String? = null,
)
