package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonSdkError
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.RevisionUid
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.NodeNameConflictErrorData.toEntity() = ProtonSdkError.Data.NodeNameConflict(
    conflictingNodeIsFileDraft = conflictingNodeIsFileDraft,
    conflictingNodeUid = NodeUid(conflictingNodeUid),
    conflictingRevisionUid = RevisionUid(conflictingRevisionUid),
)
