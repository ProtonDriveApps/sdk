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
