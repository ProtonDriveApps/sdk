package me.proton.drive.sdk.entity

import me.proton.drive.sdk.LoggerProvider

data class ProtonClientOptions(
    val userAgent: String? = null,
    val baseUrl: String? = null,
    val bindingsLanguage: String? = null,
    val tlsPolicy: ProtonClientTlsPolicy? = null,
    val loggerProvider: LoggerProvider? = null,
    val entityCachePath: String? = null,
)
