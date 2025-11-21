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

import me.proton.drive.sdk.entity.ProtonClientOptions
import proton.sdk.protonClientOptions
import proton.sdk.telemetry

internal fun ProtonClientOptions.toProtobuf(
    recordMetricAction: Long? = null,
) = protonClientOptions {
    this@toProtobuf.userAgent?.let { userAgent = it }
    this@toProtobuf.baseUrl?.let { baseUrl = it }
    this@toProtobuf.bindingsLanguage?.let { bindingsLanguage = it }
    this@toProtobuf.tlsPolicy?.let { tlsPolicy = it.toProtobuf() }
    telemetry = telemetry {
        this@toProtobuf.loggerProvider?.let { loggerProviderHandle = it.handle }
        recordMetricAction?.let { this@telemetry.recordMetricAction = recordMetricAction }
    }
    this@toProtobuf.entityCachePath?.let { entityCachePath = it }
}
