package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.ParentNodeUid
import me.proton.drive.sdk.entity.PhotoNode
import me.proton.drive.sdk.entity.ScopeId
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.trashTimeOrNull

fun ProtonDriveSdk.PhotoNode.toEntity() = PhotoNode(
    uid = NodeUid(uid),
    parentUid = parentUid.takeIf { hasParentUid() }?.let(::ParentNodeUid),
    treeEventScopeId = ScopeId(treeEventScopeId),
    name = name.toEntity(),
    mediaType = mediaType,
    creationTime = creationTime.toInstant(),
    trashTime = trashTimeOrNull?.toInstant(),
    nameAuthor = nameAuthor.toEntity(),
    keyAuthor = keyAuthor.toEntity(),
    activeRevision = activeRevision.toEntity(),
    totalStorageSize = totalStorageSize,
    ownedBy = ownedBy.toEntity(),
    isShared = isShared,
    isSharedPublicly = isSharedPublicly,
    errors = errorsList.map { it.toEntity() },
    captureTime = captureTime.toInstant(),
    albumUids = albumUidsList.map(::NodeUid),
)
