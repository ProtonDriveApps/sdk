package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.SearchHit
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.SearchHit.toEntity(): SearchHit =
    SearchHit(
        nodeUid = NodeUid(identifier),
        score = score,
    )
