package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.UploadSizeClass
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadSizeClass.toEnum() = when(this) {
    ProtonDriveSdk.UploadSizeClass.UPLOAD_SIZE_CLASS_UNSPECIFIED -> UploadSizeClass.UNSPECIFIED
    ProtonDriveSdk.UploadSizeClass.UPLOAD_SIZE_CLASS_SMALL -> UploadSizeClass.SMALL
    ProtonDriveSdk.UploadSizeClass.UPLOAD_SIZE_CLASS_SINGLE -> UploadSizeClass.SINGLE
    ProtonDriveSdk.UploadSizeClass.UPLOAD_SIZE_CLASS_MULTI -> UploadSizeClass.MULTI
    ProtonDriveSdk.UploadSizeClass.UNRECOGNIZED -> UploadSizeClass.UNRECOGNIZED
}
