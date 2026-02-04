package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.NodeResult
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.FolderChildrenList.toEntity(): List<NodeResult> =
    childrenList.map { it.toEntity() }
