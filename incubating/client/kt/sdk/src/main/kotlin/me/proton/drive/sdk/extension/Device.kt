package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.Device
import me.proton.drive.sdk.entity.DeviceUid
import me.proton.drive.sdk.entity.NodeUid
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.lastSyncTimeOrNull

@Suppress("DEPRECATION")
fun ProtonDriveSdk.Device.toEntity() = Device(
    uid = DeviceUid(uid),
    type = type.toEntity(),
    name = name.toEntity(),
    rootFolderUid = NodeUid(rootFolderUid),
    creationTime = creationTime.toInstant(),
    lastSyncTime = lastSyncTimeOrNull?.toInstant(),
    shareId = shareId,
)
