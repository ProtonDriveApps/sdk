package me.proton.drive.sdk.telemetry

data class ApiRetrySucceededEvent(
    val url: String,
    val failedAttempts: Int,
)
