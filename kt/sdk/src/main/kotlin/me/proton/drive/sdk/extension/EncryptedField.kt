/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Drive.
 *
 * Proton Drive is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Drive is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Drive.  If not, see <https://www.gnu.org/licenses/>.
 */

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
