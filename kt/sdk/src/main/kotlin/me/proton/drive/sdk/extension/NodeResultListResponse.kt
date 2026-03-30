package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.NodeResultPair
import me.proton.drive.sdk.entity.NodeUid
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.NodeResultListResponse.toEntity(): List<NodeResultPair> =
    resultsList.map { it.toEntity() }

fun ProtonDriveSdk.NodeResultPair.toEntity(): NodeResultPair =
    if (hasError()) {
        NodeResultPair.Failure(nodeUid = NodeUid(nodeUid), error = error.toException())
    } else {
        NodeResultPair.Success(nodeUid = NodeUid(nodeUid))
    }
