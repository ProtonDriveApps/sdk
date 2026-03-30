package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DegradedFileNode
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.ParentNodeUid
import me.proton.drive.sdk.entity.ScopeId
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.activeRevisionOrNull
import proton.drive.sdk.trashTimeOrNull

fun ProtonDriveSdk.DegradedFileNode.toEntity() = DegradedFileNode(
    uid = NodeUid(uid),
    parentUid = ParentNodeUid(parentUid),
    treeEventScopeId = ScopeId(treeEventScopeId),
    name = name.toEntity(),
    mediaType = mediaType,
    creationTime = creationTime.toInstant(),
    trashTime = trashTimeOrNull?.toInstant(),
    nameAuthor = nameAuthor.toEntity(),
    author = author.toEntity(),
    activeRevision = activeRevisionOrNull?.toEntity(),
    totalStorageQuotaUsage = totalStorageQuotaUsage,
    errors = errorsList.map { it.toEntity() },
)
