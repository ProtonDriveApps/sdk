package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.EncryptedField
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.EncryptedField.toEnum() = when(this) {
    ProtonDriveSdk.EncryptedField.ENCRYPTED_FIELD_SHARE_KEY -> EncryptedField.SHARE_KEY
    ProtonDriveSdk.EncryptedField.ENCRYPTED_FIELD_NODE_KEY -> EncryptedField.NODE_KEY
    ProtonDriveSdk.EncryptedField.ENCRYPTED_FIELD_NODE_NAME -> EncryptedField.NODE_NAME
    ProtonDriveSdk.EncryptedField.ENCRYPTED_FIELD_NODE_HASH_KEY -> EncryptedField.NODE_HASH_KEY
    ProtonDriveSdk.EncryptedField.ENCRYPTED_FIELD_NODE_EXTENDED_ATTRIBUTES -> EncryptedField.NODE_EXTENDED_ATTRIBUTES
    ProtonDriveSdk.EncryptedField.ENCRYPTED_FIELD_NODE_CONTENT_KEY -> EncryptedField.NODE_CONTENT_KEY
    ProtonDriveSdk.EncryptedField.ENCRYPTED_FIELD_CONTENT -> EncryptedField.CONTENT
    ProtonDriveSdk.EncryptedField.UNRECOGNIZED -> EncryptedField.UNRECOGNIZED
}
