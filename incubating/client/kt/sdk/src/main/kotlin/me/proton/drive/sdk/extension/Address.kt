package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.Address
import me.proton.drive.sdk.entity.Address.Status
import proton.drive.sdk.ProtonDriveSdk.AddressStatus.ADDRESS_STATUS_DELETING
import proton.drive.sdk.ProtonDriveSdk.AddressStatus.ADDRESS_STATUS_DISABLED
import proton.drive.sdk.ProtonDriveSdk.AddressStatus.ADDRESS_STATUS_ENABLED
import proton.drive.sdk.address
import proton.drive.sdk.addressKey

fun Address.toProtobuf() = address {
    addressId = this@toProtobuf.addressId
    order = this@toProtobuf.order
    emailAddress = this@toProtobuf.emailAddress
    status = when (this@toProtobuf.status) {
        Status.DISABLED -> ADDRESS_STATUS_DISABLED
        Status.ENABLED -> ADDRESS_STATUS_ENABLED
        Status.DELETING -> ADDRESS_STATUS_DELETING
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
