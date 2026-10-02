package me.proton.drive.sdk.telemetry

data class DecryptionErrorEvent(
    val field: EncryptedField,
    val recency: ItemRecency,
    val createdBy: ItemCreator,
    val error: String?,
    val uid: String,
)
