package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.RevisionUid
import me.proton.drive.sdk.entity.UploadResult
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadResult.toEntity() = UploadResult(
    nodeUid = NodeUid(nodeUid),
    revisionUid = RevisionUid(revisionUid)
)
