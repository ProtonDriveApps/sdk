package me.proton.drive.sdk.telemetry

data class UploadEvent(
    val volumeType: VolumeType,
    val expectedSize: Long,
    val uploadedSize: Long,
    val error: UploadError?,
    val originalError: String?,
)
