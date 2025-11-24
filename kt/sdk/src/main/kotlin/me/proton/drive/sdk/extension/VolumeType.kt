package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.VolumeType
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.VolumeType.toEnum() = when (this) {
    ProtonDriveSdk.VolumeType.VOLUME_TYPE_OWN_VOLUME -> VolumeType.OWN_VOLUME
    ProtonDriveSdk.VolumeType.VOLUME_TYPE_SHARED -> VolumeType.SHARED
    ProtonDriveSdk.VolumeType.VOLUME_TYPE_SHARED_PUBLIC -> VolumeType.SHARED_PUBLIC
    ProtonDriveSdk.VolumeType.VOLUME_TYPE_PHOTO -> VolumeType.PHOTO
    ProtonDriveSdk.VolumeType.UNRECOGNIZED -> VolumeType.UNRECOGNIZED
}
