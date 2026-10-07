package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.AvailableNameTarget
import proton.drive.sdk.ProtonDriveSdk

fun AvailableNameTarget.toProto() = when (this) {
    AvailableNameTarget.FILE -> ProtonDriveSdk.AvailableNameTarget.AVAILABLE_NAME_TARGET_FILE
    AvailableNameTarget.FOLDER -> ProtonDriveSdk.AvailableNameTarget.AVAILABLE_NAME_TARGET_FOLDER
}
