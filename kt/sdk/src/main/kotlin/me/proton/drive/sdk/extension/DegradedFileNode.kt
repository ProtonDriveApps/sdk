package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DegradedFileNode
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.activeRevisionOrNull
import proton.drive.sdk.trashTimeOrNull

fun ProtonDriveSdk.DegradedFileNode.toEntity() = DegradedFileNode(
    uid = uid,
    parentUid = parentUid,
    treeEventScopeId = treeEventScopeId,
    name = name.toEntity(),
    mediaType = mediaType,
    creationTime = creationTime.seconds,
    trashTime = trashTimeOrNull?.seconds,
    nameAuthor = nameAuthor.toEntity(),
    author = author.toEntity(),
    activeRevision = activeRevisionOrNull?.toEntity(),
    totalStorageQuotaUsage = totalStorageQuotaUsage,
    errors = errorsList.map { it.toEntity() },
)
