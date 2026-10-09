package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonSdkError
import me.proton.drive.sdk.entity.NodeUid
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.AlbumContainsPhotosNotInTimelineErrorData.toEntity() = ProtonSdkError.Data.AlbumContainsPhotosNotInTimeline(
    photoUids = photoUidsList.map { NodeUid(it) },
)
