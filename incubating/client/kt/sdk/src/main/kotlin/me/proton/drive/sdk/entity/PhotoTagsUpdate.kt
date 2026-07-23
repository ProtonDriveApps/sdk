package me.proton.drive.sdk.entity

data class PhotoTagsUpdate(
    val nodeUid: NodeUid,
    val tagsToAdd: List<PhotoTag> = emptyList(),
    val tagsToRemove: List<PhotoTag> = emptyList(),
)
