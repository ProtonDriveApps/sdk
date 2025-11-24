package me.proton.drive.sdk.telemetry

data class DecryptionErrorEvent(
    val volumeType: VolumeType,
    val field: EncryptedField,
    val fromBefore2024: Boolean,
    val error: String?,
    val uid: String,
)
