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

import me.proton.drive.sdk.telemetry.VolumeType
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.VolumeType.toEnum() = when (this) {
    ProtonDriveSdk.VolumeType.VOLUME_TYPE_OWN_VOLUME -> VolumeType.OWN_VOLUME
    ProtonDriveSdk.VolumeType.VOLUME_TYPE_SHARED -> VolumeType.SHARED
    ProtonDriveSdk.VolumeType.VOLUME_TYPE_SHARED_PUBLIC -> VolumeType.SHARED_PUBLIC
    ProtonDriveSdk.VolumeType.VOLUME_TYPE_PHOTO -> VolumeType.PHOTO
    ProtonDriveSdk.VolumeType.UNRECOGNIZED -> VolumeType.UNRECOGNIZED
}
