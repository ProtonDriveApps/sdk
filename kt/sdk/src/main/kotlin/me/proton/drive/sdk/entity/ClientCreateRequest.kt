package me.proton.drive.sdk.entity

import me.proton.drive.sdk.LoggerProvider

data class ClientCreateRequest(
    val baseUrl: String,
    val entityCachePath: String,
    val secretCachePath: String,
    val loggerProvider: LoggerProvider,
    val bindingsLanguage: String? = null,
    val uid: String? = null,
)
