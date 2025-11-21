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

import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toEntity
import me.proton.drive.sdk.internal.JniDriveClient
import proton.drive.sdk.driveClientGetAvailableNameRequest
import proton.drive.sdk.driveClientGetThumbnailsRequest
import java.io.OutputStream

class DriveClient internal constructor(
    internal val handle: Long,
    private val bridge: JniDriveClient,
    session: Session? = null,
) : SdkNode(session), AutoCloseable {

    suspend fun getAvailableName(
        parentFolderUid: String,
        name: String,
    ): String = cancellationTokenSource().let { source ->
        bridge.getAvailableName(
            driveClientGetAvailableNameRequest {
                this.parentFolderUid = parentFolderUid
                this.name = name
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    suspend fun getThumbnails(
        fileUids: List<String>,
        block: (String, ThumbnailType) -> OutputStream?,
    ): Unit = cancellationTokenSource().let { source ->
        bridge.getThumbnails(
            driveClientGetThumbnailsRequest {
                this.fileUids += fileUids
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).thumbnailsList.forEach { fileThumbnail ->
            fileThumbnail.type.toEntity()?.let { thumbnailType ->
                block(fileThumbnail.fileUid, thumbnailType)
            }?.use { outputStream ->
                outputStream.write(fileThumbnail.data.toByteArray())
            }
        }
    }

    override fun close() {
        bridge.free(handle)
        super.close()
    }
}

suspend fun Session.driveClientCreate(): DriveClient = JniDriveClient().run {
    val session = this@driveClientCreate
    DriveClient(
        session = session,
        handle = create(handle),
        bridge = this,
    )
}
