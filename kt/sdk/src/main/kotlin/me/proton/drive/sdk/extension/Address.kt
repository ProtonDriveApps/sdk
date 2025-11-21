/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Core.
 *
 * Proton Core is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Core is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Core.  If not, see <https://www.gnu.org/licenses/>.
 */

package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.Address
import me.proton.drive.sdk.entity.Address.Status
import proton.sdk.ProtonSdk
import proton.sdk.address
import proton.sdk.addressKey

fun Address.toProtobuf() = address {
    addressId = this@toProtobuf.addressId
    order = this@toProtobuf.order
    emailAddress = this@toProtobuf.emailAddress
    status = when (this@toProtobuf.status) {
        Status.DISABLED -> ProtonSdk.AddressStatus.ADDRESS_STATUS_DISABLED
        Status.ENABLED -> ProtonSdk.AddressStatus.ADDRESS_STATUS_ENABLED
        Status.DELETING -> ProtonSdk.AddressStatus.ADDRESS_STATUS_DELETING
    }
    keys.addAll(this@toProtobuf.keys.map { it.toProtobuf() })
    primaryKeyIndex = this@toProtobuf.primaryKeyIndex
}

fun Address.Key.toProtobuf() = addressKey {
    addressId = this@toProtobuf.addressId
    addressKeyId = this@toProtobuf.keyId
    isActive = active
    isAllowedForEncryption = allowedForEncryption
    isAllowedForVerification = allowedForVerification
}
