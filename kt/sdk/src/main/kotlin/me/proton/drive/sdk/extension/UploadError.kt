package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.UploadError
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadError.toEnum() = when(this) {
    ProtonDriveSdk.UploadError.UPLOAD_ERROR_SERVER_ERROR -> UploadError.SERVER_ERROR
    ProtonDriveSdk.UploadError.UPLOAD_ERROR_NETWORK_ERROR -> UploadError.NETWORK_ERROR
    ProtonDriveSdk.UploadError.UPLOAD_ERROR_INTEGRITY_ERROR -> UploadError.INTEGRITY_ERROR
    ProtonDriveSdk.UploadError.UPLOAD_ERROR_RATE_LIMITED -> UploadError.RATE_LIMITED
    ProtonDriveSdk.UploadError.UPLOAD_ERROR_HTTP_CLIENT_SIDE_ERROR -> UploadError.HTTP_CLIENT_SIDE_ERROR
    ProtonDriveSdk.UploadError.UPLOAD_ERROR_UNKNOWN -> UploadError.UNKNOWN
    ProtonDriveSdk.UploadError.UNRECOGNIZED -> UploadError.UNRECOGNIZED
}
