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

import com.google.protobuf.timestamp
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import proton.drive.sdk.driveClientGetFileRevisionUploaderRequest

internal fun FileRevisionUploaderRequest.toProtobuf(
    clientHandle: Long,
    cancellationTokenSourceHandle: Long,
) = driveClientGetFileRevisionUploaderRequest {
    this.clientHandle = clientHandle
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
    this.currentActiveRevisionUid = this@toProtobuf.currentActiveRevisionUid
    this.size = this@toProtobuf.size
    this.lastModificationTime = timestamp { seconds = this@toProtobuf.lastModificationTime }
}
