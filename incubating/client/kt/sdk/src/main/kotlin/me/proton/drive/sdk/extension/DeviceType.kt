package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DeviceType
import proton.drive.sdk.ProtonDriveSdk

fun DeviceType.toProto() = when (this) {
    DeviceType.WINDOWS -> ProtonDriveSdk.DeviceType.DEVICE_TYPE_WINDOWS
    DeviceType.MACOS -> ProtonDriveSdk.DeviceType.DEVICE_TYPE_MACOS
    DeviceType.LINUX -> ProtonDriveSdk.DeviceType.DEVICE_TYPE_LINUX
}

fun ProtonDriveSdk.DeviceType.toEntity() = when (this) {
    ProtonDriveSdk.DeviceType.DEVICE_TYPE_WINDOWS -> DeviceType.WINDOWS
    ProtonDriveSdk.DeviceType.DEVICE_TYPE_MACOS -> DeviceType.MACOS
    ProtonDriveSdk.DeviceType.DEVICE_TYPE_LINUX -> DeviceType.LINUX
    ProtonDriveSdk.DeviceType.DEVICE_TYPE_UNSPECIFIED,
    ProtonDriveSdk.DeviceType.UNRECOGNIZED -> error("Invalid DeviceType: $this")
}
