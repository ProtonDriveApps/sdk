package me.proton.drive.sdk.telemetry

data class VerificationErrorEvent(
    val field: EncryptedField,
    val recency: ItemRecency,
    val createdBy: ItemCreator,
    val addressMatchingDefaultShare: Boolean,
    val error: String?,
    val uid: String,
)
