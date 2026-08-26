package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.UploadBlockCount
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadBlockCount.toEnum() = when(this) {
    ProtonDriveSdk.UploadBlockCount.UPLOAD_BLOCK_COUNT_UNSPECIFIED -> UploadBlockCount.UNSPECIFIED
    ProtonDriveSdk.UploadBlockCount.UPLOAD_BLOCK_COUNT_SINGLE -> UploadBlockCount.SINGLE
    ProtonDriveSdk.UploadBlockCount.UPLOAD_BLOCK_COUNT_FEW -> UploadBlockCount.FEW
    ProtonDriveSdk.UploadBlockCount.UPLOAD_BLOCK_COUNT_MANY -> UploadBlockCount.MANY
    ProtonDriveSdk.UploadBlockCount.UNRECOGNIZED -> UploadBlockCount.UNRECOGNIZED
}
