package me.proton.drive.sdk.telemetry

data class DownloadEvent(
    val volumeType: VolumeType,
    val claimedFileSize: Long,
    val downloadedSize: Long,
    val error: DownloadError?,
    val originalError: String?,
)
