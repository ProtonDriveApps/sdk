package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.DownloadError
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.DownloadError.toEnum() = when (this) {
    ProtonDriveSdk.DownloadError.DOWNLOAD_ERROR_SERVER_ERROR -> DownloadError.SERVER_ERROR
    ProtonDriveSdk.DownloadError.DOWNLOAD_ERROR_NETWORK_ERROR -> DownloadError.NETWORK_ERROR
    ProtonDriveSdk.DownloadError.DOWNLOAD_ERROR_DECRYPTION_ERROR -> DownloadError.DECRYPTION_ERROR
    ProtonDriveSdk.DownloadError.DOWNLOAD_ERROR_INTEGRITY_ERROR -> DownloadError.INTEGRITY_ERROR
    ProtonDriveSdk.DownloadError.DOWNLOAD_ERROR_RATE_LIMITED -> DownloadError.RATE_LIMITED
    ProtonDriveSdk.DownloadError.DOWNLOAD_ERROR_HTTP_CLIENT_SIDE_ERROR -> DownloadError.HTTP_CLIENT_SIDE_ERROR
    ProtonDriveSdk.DownloadError.DOWNLOAD_ERROR_UNKNOWN -> DownloadError.UNKNOWN
    ProtonDriveSdk.DownloadError.UNRECOGNIZED -> DownloadError.UNRECOGNIZED
}
