package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DriveError
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.DriveError.toEntity(): DriveError = DriveError(
    message = message,
    innerError = if (hasInnerError()) innerError.toEntity() else null,
)
