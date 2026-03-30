package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.FolderNode
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.ParentNodeUid
import me.proton.drive.sdk.entity.ScopeId
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.trashTimeOrNull

fun ProtonDriveSdk.FolderNode.toEntity() = FolderNode(
    uid = NodeUid(uid),
    parentUid = ParentNodeUid(parentUid),
    treeEventScopeId = ScopeId(treeEventScopeId),
    name = name,
    creationTime = creationTime.toInstant(),
    trashTime = trashTimeOrNull?.toInstant(),
    nameAuthor = nameAuthor.toEntity(),
    author = author.toEntity()
)
