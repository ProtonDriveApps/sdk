package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonSdkError
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.RevisionUid
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.NodeNameConflictErrorData.toEntity() = ProtonSdkError.Data.NodeNameConflict(
    conflictingNodeIsFileDraft = takeIf { hasConflictingNodeIsFileDraft() }?.let { conflictingNodeIsFileDraft },
    conflictingNodeUid = takeIf { hasConflictingNodeUid() }?.let { NodeUid(conflictingNodeUid) },
    conflictingRevisionUid = takeIf { hasConflictingRevisionUid() }?.let { RevisionUid(conflictingRevisionUid) },
)
