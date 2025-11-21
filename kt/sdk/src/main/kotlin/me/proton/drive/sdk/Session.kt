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

package me.proton.drive.sdk

import me.proton.drive.sdk.entity.SessionRenewRequest
import me.proton.drive.sdk.internal.JniSession

class Session internal constructor(
    internal val handle: Long,
    private val bridge: JniSession,
    override val cancellationTokenSource: CancellationTokenSource
) : SdkNode(null), AutoCloseable, Cancellable {

    suspend fun renew(
        request: SessionRenewRequest,
    ): Session = bridge.renew(handle, request).run {
        Session(this, bridge, cancellationTokenSource)
    }

    suspend fun end() = bridge.end(handle)

    override fun close() {
        bridge.free(handle)
        super.close()
    }
}
