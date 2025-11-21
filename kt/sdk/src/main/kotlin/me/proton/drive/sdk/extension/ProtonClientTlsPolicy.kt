/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Core.
 *
 * Proton Core is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Core is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Core.  If not, see <https://www.gnu.org/licenses/>.
 */

package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.ProtonClientTlsPolicy
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.NO_CERTIFICATE_PINNING
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.NO_CERTIFICATE_VALIDATION
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.STRICT
import proton.sdk.ProtonSdk.ProtonClientTlsPolicy.PROTON_CLIENT_TLS_POLICY_NO_CERTIFICATE_PINNING
import proton.sdk.ProtonSdk.ProtonClientTlsPolicy.PROTON_CLIENT_TLS_POLICY_NO_CERTIFICATE_VALIDATION
import proton.sdk.ProtonSdk.ProtonClientTlsPolicy.PROTON_CLIENT_TLS_POLICY_STRICT

fun ProtonClientTlsPolicy.toProtobuf(): proton.sdk.ProtonSdk.ProtonClientTlsPolicy = when (this) {
    STRICT -> PROTON_CLIENT_TLS_POLICY_STRICT
    NO_CERTIFICATE_PINNING -> PROTON_CLIENT_TLS_POLICY_NO_CERTIFICATE_PINNING
    NO_CERTIFICATE_VALIDATION -> PROTON_CLIENT_TLS_POLICY_NO_CERTIFICATE_VALIDATION
}
