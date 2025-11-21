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

import me.proton.drive.sdk.entity.SessionResumeRequest
import proton.sdk.sessionResumeRequest

internal fun SessionResumeRequest.toProtobuf() = sessionResumeRequest {
    sessionId = this@toProtobuf.sessionId
    username = this@toProtobuf.username
    appVersion = this@toProtobuf.appVersion
    userId = this@toProtobuf.userId
    accessToken = this@toProtobuf.accessToken
    refreshToken = this@toProtobuf.refreshToken
    scopes.addAll(this@toProtobuf.scopes)
    isWaitingForSecondFactorCode = this@toProtobuf.isWaitingForSecondFactorCode
    isWaitingForDataPassword = this@toProtobuf.isWaitingForDataPassword
    secretCachePath = this@toProtobuf.secretCachePath
    options = this@toProtobuf.options.toProtobuf()
}
