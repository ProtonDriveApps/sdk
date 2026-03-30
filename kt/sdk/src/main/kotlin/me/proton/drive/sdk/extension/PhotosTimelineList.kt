package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.PhotosTimelineItem
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.PhotosTimelineList.toEntity(): List<PhotosTimelineItem> =
    itemsList.map { it.toEntity() }

fun ProtonDriveSdk.PhotosTimelineItem.toEntity() = PhotosTimelineItem(
    nodeUid = NodeUid(nodeUid),
    captureTime = captureTime.toInstant(),
)
