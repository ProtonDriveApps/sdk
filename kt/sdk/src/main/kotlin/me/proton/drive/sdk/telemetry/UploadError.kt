package me.proton.drive.sdk.telemetry

enum class UploadError {
    UNRECOGNIZED,
    SERVER_ERROR,
    NETWORK_ERROR,
    INTEGRITY_ERROR,
    RATE_LIMITED,
    HTTP_CLIENT_SIDE_ERROR,
    UNKNOWN,
}
