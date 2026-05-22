package me.proton.drive.sdk.telemetry

data class BlockVerificationErrorEvent(
    val volumeType: VolumeType,
    val retryHelped: Boolean,
)
