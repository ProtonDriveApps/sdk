package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.Node
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.folderOrNull

fun ProtonDriveSdk.Node.toEntity(): Node =
    when (nodeCase) {
        ProtonDriveSdk.Node.NodeCase.FOLDER -> folder.toEntity()
        ProtonDriveSdk.Node.NodeCase.FILE -> file.toEntity()
        ProtonDriveSdk.Node.NodeCase.NODE_NOT_SET, null ->
            error("Invalid Node: node not set")
    }

fun ProtonDriveSdk.Node.toFolder(): ProtonDriveSdk.FolderNode = checkNotNull(folderOrNull) {
    "Node must be a folder, not $nodeCase"
}
