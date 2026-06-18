package me.proton.drive.sdk.entity

data class DriveError(
    val message: String? = null,
    val innerError: DriveError? = null,
)
