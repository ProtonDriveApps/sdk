package me.proton.drive.sdk.entity

import java.time.Instant

data class Device(
    val uid: DeviceUid,
    val type: DeviceType,
    val name: Result<String>,
    val rootFolderUid: NodeUid,
    val creationTime: Instant,
    val lastSyncTime: Instant?,
    @Deprecated("To be removed once Volume-based navigation is implemented.")
    val shareId: String,
)
