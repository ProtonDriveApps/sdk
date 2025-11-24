package me.proton.drive.sdk.telemetry

data class DownloadEvent(
    val volumeType: VolumeType,
    val expectedSize: Long,
    val uploadedSize: Long,
    val error: DownloadError?,
    val originalError: String?,
)
