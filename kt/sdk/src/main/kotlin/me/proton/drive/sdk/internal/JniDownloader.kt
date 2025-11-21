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
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.toLongResponse
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.downloadToStreamRequest
import proton.drive.sdk.driveClientGetFileDownloaderRequest
import proton.drive.sdk.fileDownloaderFreeRequest
import proton.drive.sdk.request
import java.nio.ByteBuffer

class JniDownloader internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun create(
        clientHandle: Long,
        cancellationTokenSourceHandle: Long,
        revisionUid: String,
    ): Long = executeOnce("create", LongResponseCallback) {
        driveClientGetFileDownloader = driveClientGetFileDownloaderRequest {
            this.revisionUid = revisionUid
            this.clientHandle = clientHandle
            this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
        }
    }

    suspend fun downloadToStream(
        handle: Long,
        cancellationTokenSourceHandle: Long,
        onWrite: suspend (ByteBuffer) -> Unit,
        onProgress: suspend (ProtonDriveSdk.ProgressUpdate) -> Unit,
        coroutineScope: CoroutineScope
    ): Long = executePersistent(
        clientBuilder = { continuation ->
            ProtonDriveSdkNativeClient(
                method("downloadToStream"),
                continuation.toLongResponse(),
                write = onWrite,
                progress = onProgress,
                logger = logger,
                coroutineScope = coroutineScope,
            )
        },
        requestBuilder = { client ->
            request {
                downloadToStream = downloadToStreamRequest {
                    this.downloaderHandle = handle
                    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
                    writeAction = client.getWritePointer()
                    progressAction = client.getProgressPointer()
                }
            }
        }
    )

    fun free(handle: Long) {
        dispatch("free") {
            fileDownloaderFree = fileDownloaderFreeRequest { fileDownloaderHandle = handle }
        }
        releaseAll()
    }
}
