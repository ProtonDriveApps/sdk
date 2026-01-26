package me.proton.drive.sdk.entity

import me.proton.drive.sdk.LoggerProvider

data class ClientCreateRequest(
    val baseUrl: String,
    val loggerProvider: LoggerProvider,
    val entityCachePath: String? = null,
    val secretCachePath: String? = null,
    val bindingsLanguage: String? = null,
    val uid: String? = null,
    val apiCallTimeout: Int? = null,
    val storageCallTimeout: Int? = null,
)
