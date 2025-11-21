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

package me.proton.drive.sdk.internal

import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.UnitResponseCallback
import proton.sdk.cancellationTokenSourceCancelRequest
import proton.sdk.cancellationTokenSourceCreateRequest
import proton.sdk.cancellationTokenSourceFreeRequest

class JniCancellationTokenSource internal constructor() : JniBaseProtonSdk() {

    suspend fun create(): Long = executeOnce("create", LongResponseCallback) {
        cancellationTokenSourceCreate = cancellationTokenSourceCreateRequest { }
    }

    suspend fun cancel(handle: Long) {
        executeOnce("cancel", UnitResponseCallback) {
            cancellationTokenSourceCancel = cancellationTokenSourceCancelRequest {
                cancellationTokenSourceHandle = handle
            }
        }
    }

    fun free(handle: Long) {
        dispatch("free") {
            cancellationTokenSourceFree = cancellationTokenSourceFreeRequest {
                cancellationTokenSourceHandle = handle
            }
        }
        releaseAll()
    }
}
