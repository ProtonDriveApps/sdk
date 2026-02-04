package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.FileNode
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.trashTimeOrNull

fun ProtonDriveSdk.FileNode.toEntity() = FileNode(
    uid = uid,
    parentUid = parentUid,
    treeEventScopeId = treeEventScopeId,
    name = name,
    mediaType = mediaType,
    creationTime = creationTime.seconds,
    trashTime = trashTimeOrNull?.seconds,
    nameAuthor = nameAuthor.toEntity(),
    author = author.toEntity(),
    activeRevision = activeRevision.toEntity(),
    totalSizeOnCloudStorage = totalSizeOnCloudStorage,
)
