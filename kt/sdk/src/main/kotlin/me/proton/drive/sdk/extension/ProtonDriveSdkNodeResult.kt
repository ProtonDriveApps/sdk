package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DegradedNode
import me.proton.drive.sdk.entity.Node
import me.proton.drive.sdk.entity.NodeResult
import proton.drive.sdk.ProtonDriveSdk


fun ProtonDriveSdk.NodeResult.toEntity(): NodeResult =
    when (resultCase) {
        ProtonDriveSdk.NodeResult.ResultCase.VALUE -> NodeResult.Value(value.toEntity())
        ProtonDriveSdk.NodeResult.ResultCase.ERROR -> NodeResult.Error(error.toEntity())
        ProtonDriveSdk.NodeResult.ResultCase.RESULT_NOT_SET, null ->
            error("Invalid NodeResult: result not set")
    }

fun ProtonDriveSdk.Node.toEntity(): Node =
    when (nodeCase) {
        ProtonDriveSdk.Node.NodeCase.FOLDER -> folder.toEntity()
        ProtonDriveSdk.Node.NodeCase.FILE -> file.toEntity()
        ProtonDriveSdk.Node.NodeCase.NODE_NOT_SET, null ->
            error("Invalid Node: result not set")
    }

fun ProtonDriveSdk.DegradedNode.toEntity(): DegradedNode =
    when (nodeCase) {
        ProtonDriveSdk.DegradedNode.NodeCase.FOLDER -> folder.toEntity()
        ProtonDriveSdk.DegradedNode.NodeCase.FILE -> file.toEntity()
        ProtonDriveSdk.DegradedNode.NodeCase.NODE_NOT_SET, null ->
            error("Invalid DegradedNode: result not set")
    }
