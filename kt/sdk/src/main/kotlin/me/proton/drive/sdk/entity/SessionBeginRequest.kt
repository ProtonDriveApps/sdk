package me.proton.drive.sdk.entity

import java.io.File

data class SessionBeginRequest(
    val username: String,
    val password: String,
    val appVersion: String,
    val secretCache: File,
    val options: ProtonClientOptions,
)
