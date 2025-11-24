package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.UploadResult
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadResult.toEntity() = UploadResult(
    nodeUid = nodeUid,
    revisionUid = revisionUid
)
