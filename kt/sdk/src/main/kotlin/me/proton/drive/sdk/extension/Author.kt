package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.Author
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.Author.toEntity() = Author(
    emailAddress = emailAddress,
)
