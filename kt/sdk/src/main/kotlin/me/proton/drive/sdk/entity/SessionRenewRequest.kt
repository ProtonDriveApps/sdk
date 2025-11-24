package me.proton.drive.sdk.entity

data class SessionRenewRequest(
    val sessionId: String,
    val accessToken: String,
    val refreshToken: String,
    val scopes: List<String>,
    val isWaitingForSecondFactorCode: Boolean,
    val isWaitingForDataPassword: Boolean,
)
