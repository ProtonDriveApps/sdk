package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.UploadRoute
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadRoute.toEnum() = when(this) {
    ProtonDriveSdk.UploadRoute.UPLOAD_ROUTE_UNSPECIFIED -> UploadRoute.UNSPECIFIED
    ProtonDriveSdk.UploadRoute.UPLOAD_ROUTE_SMALL -> UploadRoute.SMALL
    ProtonDriveSdk.UploadRoute.UPLOAD_ROUTE_BLOCK -> UploadRoute.BLOCK
    ProtonDriveSdk.UploadRoute.UNRECOGNIZED -> UploadRoute.UNRECOGNIZED
}
