package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.AlbumNode
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.ParentNodeUid
import me.proton.drive.sdk.entity.ScopeId
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.lastActivityTimeOrNull
import proton.drive.sdk.trashTimeOrNull

fun ProtonDriveSdk.AlbumNode.toEntity() = AlbumNode(
    uid = NodeUid(uid),
    parentUid = parentUid.takeIf { hasParentUid() }?.let(::ParentNodeUid),
    treeEventScopeId = ScopeId(treeEventScopeId),
    name = name.toEntity(),
    creationTime = creationTime.toInstant(),
    trashTime = trashTimeOrNull?.toInstant(),
    nameAuthor = nameAuthor.toEntity(),
    keyAuthor = keyAuthor.toEntity(),
    ownedBy = ownedBy.toEntity(),
    isShared = isShared,
    isSharedByUrl = isSharedByUrl,
    errors = errorsList.map { it.toEntity() },
    photoCount = photoCount,
    coverPhotoNodeUid = coverPhotoNodeUid.takeIf { hasCoverPhotoNodeUid() }?.let(::NodeUid),
    lastActivityTime = lastActivityTimeOrNull?.toInstant(),
)
