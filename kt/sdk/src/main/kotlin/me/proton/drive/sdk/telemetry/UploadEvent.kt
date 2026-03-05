package me.proton.drive.sdk.telemetry

data class UploadEvent(
    val volumeType: VolumeType,
    val expectedSize: Long,
    val approximateExpectedSize: Long,
    val uploadedSize: Long,
    val approximateUploadedSize: Long,
    val error: UploadError? = null,
    val originalError: String? = null,
)
