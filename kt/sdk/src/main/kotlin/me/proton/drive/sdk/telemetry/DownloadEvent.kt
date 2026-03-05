package me.proton.drive.sdk.telemetry

data class DownloadEvent(
    val volumeType: VolumeType,
    val claimedFileSize: Long,
    val approximateClaimedFileSize: Long,
    val downloadedSize: Long,
    val approximateDownloadedSize: Long,
    val error: DownloadError? = null,
    val originalError: String? = null,
)
