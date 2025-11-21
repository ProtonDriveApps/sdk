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
