package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonSdkError
import me.proton.drive.sdk.entity.NodeUid
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.NodeNotFoundErrorData.toEntity() = ProtonSdkError.Data.NodeNotFound(
    nodeUid = takeIf { hasNodeUid() }?.let { NodeUid(nodeUid) },
)
