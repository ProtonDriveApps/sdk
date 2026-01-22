package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.FolderNode
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.trashTimeOrNull

fun ProtonDriveSdk.FolderNode.toEntity() = FolderNode(
    uid = uid,
    parentUid = parentUid,
    treeEventScopeId = treeEventScopeId,
    name = name,
    creationTime = creationTime.seconds,
    trashTime = trashTimeOrNull?.seconds,
    nameAuthor = nameAuthor.toEntity(),
    author = author.toEntity()
)
