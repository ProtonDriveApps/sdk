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

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.entity.FileRevisionUploaderRequest
import me.proton.drive.sdk.entity.FileUploaderRequest
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.toLongResponse
import me.proton.drive.sdk.extension.toProtobuf
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_PREVIEW
import proton.drive.sdk.ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_THUMBNAIL
import proton.drive.sdk.fileUploaderFreeRequest
import proton.drive.sdk.request
import proton.drive.sdk.thumbnail
import proton.drive.sdk.uploadFromStreamRequest
import java.nio.ByteBuffer

class JniUploader internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun getFile(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
        request: FileUploaderRequest,
    ): Long = executeOnce("getFile", LongResponseCallback) {
        driveClientGetFileUploader =
            request.toProtobuf(clientHandle, cancellationTokenSourceHandle)
    }

    suspend fun getFileRevision(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
        request: FileRevisionUploaderRequest,
    ): Long = executeOnce("getFileRevision", LongResponseCallback) {
        driveClientGetFileRevisionUploader =
            request.toProtobuf(clientHandle, cancellationTokenSourceHandle)
    }

    suspend fun uploadFromStream(
        uploaderHandle: Long,
        cancellationTokenSourceHandle: Long,
        thumbnails: Map<ThumbnailType, ByteArray>,
        onRead: (ByteBuffer) -> Int,
        onProgress: suspend (ProtonDriveSdk.ProgressUpdate) -> Unit,
        coroutineScope: CoroutineScope
    ): Long = executePersistent(
        clientBuilder = { continuation ->
            ProtonDriveSdkNativeClient(
                method("uploadFromStream"),
                continuation.toLongResponse(),
                read = onRead,
                progress = onProgress,
                logger = logger,
                coroutineScope = coroutineScope,
            )
        },
        requestBuilder = { nativeClient ->
            request {
                uploadFromStream = uploadFromStreamRequest {
                    this.uploaderHandle = uploaderHandle
                    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
                    readAction = nativeClient.getReadPointer()
                    progressAction = nativeClient.getProgressPointer()
                    thumbnails.forEach { (type, data) ->
                        this.thumbnails.add(thumbnail {
                            this.type = when (type) {
                                ThumbnailType.THUMBNAIL -> THUMBNAIL_TYPE_THUMBNAIL
                                ThumbnailType.PREVIEW -> THUMBNAIL_TYPE_PREVIEW
                            }
                            dataPointer = nativeClient.getByteArrayPointer(data)
                            dataLength = data.size.toLong()
                        })
                    }
                }
            }
        }
    )

    fun free(handle: Long) {
        dispatch("free") {
            fileUploaderFree = fileUploaderFreeRequest { fileUploaderHandle = handle }
        }
        releaseAll()
    }
}
