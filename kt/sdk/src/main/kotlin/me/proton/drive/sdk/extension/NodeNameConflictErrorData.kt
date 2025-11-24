package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonSdkError
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.NodeNameConflictErrorData.toEntity() = ProtonSdkError.Data.NodeNameConflict(
    conflictingNodeIsFileDraft = conflictingNodeIsFileDraft,
    conflictingNodeUid = conflictingNodeUid,
    conflictingRevisionUid = conflictingRevisionUid,
)
