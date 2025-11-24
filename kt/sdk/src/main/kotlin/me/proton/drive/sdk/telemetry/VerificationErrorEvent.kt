package me.proton.drive.sdk.telemetry

data class VerificationErrorEvent(
    val volumeType: VolumeType,
    val field: EncryptedField,
    val fromBefore2024: Boolean,
    val addressMatchingDefaultShare: Boolean,
    val error: String?,
    val uid: String,
)
