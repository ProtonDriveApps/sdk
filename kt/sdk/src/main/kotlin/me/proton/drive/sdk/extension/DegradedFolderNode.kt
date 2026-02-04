package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DegradedFolderNode
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.trashTimeOrNull

fun ProtonDriveSdk.DegradedFolderNode.toEntity() = DegradedFolderNode(
    uid = uid,
    parentUid = parentUid,
    treeEventScopeId = treeEventScopeId,
    name = name.toEntity(),
    creationTime = creationTime.seconds,
    trashTime = trashTimeOrNull?.seconds,
    nameAuthor = nameAuthor.toEntity(),
    author = author.toEntity(),
    errors = errorsList.map { it.toEntity() },
)
