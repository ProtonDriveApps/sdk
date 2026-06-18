package me.proton.drive.sdk.entity

data class SessionResumeRequest(
    val username: String,
    val appVersion: String,
    val sessionId: String,
    val userId: String,
    val accessToken: String,
    val refreshToken: String,
    val scopes: List<String>,
    val isWaitingForSecondFactorCode: Boolean,
    val isWaitingForDataPassword: Boolean,
    val secretCachePath: String,
    val options: ProtonClientOptions,
)
