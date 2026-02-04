package me.proton.drive.sdk.entity

data class DriveError(
    val message: String,
    val innerError: DriveError? = null,
)
