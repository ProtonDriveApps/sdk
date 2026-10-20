package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DriveSearchLogicalIndex
import proton.drive.sdk.ProtonDriveSdk

fun DriveSearchLogicalIndex.toProto(): ProtonDriveSdk.DriveSearchLogicalIndex =
    when (this) {
        DriveSearchLogicalIndex.RecentNodes -> ProtonDriveSdk.DriveSearchLogicalIndex.DRIVE_SEARCH_LOGICAL_INDEX_RECENT_NODES
    }
