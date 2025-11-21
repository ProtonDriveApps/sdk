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

import me.proton.drive.sdk.entity.UploadResult
import me.proton.drive.sdk.extension.UnitResponseCallback
import me.proton.drive.sdk.extension.UploadResultResponseCallback
import me.proton.drive.sdk.extension.toEntity
import proton.drive.sdk.uploadControllerAwaitCompletionRequest
import proton.drive.sdk.uploadControllerFreeRequest
import proton.drive.sdk.uploadControllerPauseRequest
import proton.drive.sdk.uploadControllerResumeRequest

class JniUploadController internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun awaitCompletion(handle: Long): UploadResult =
        executeOnce("awaitCompletion", UploadResultResponseCallback) {
            uploadControllerAwaitCompletion = uploadControllerAwaitCompletionRequest {
                uploadControllerHandle = handle
            }
        }.toEntity()

    suspend fun pause(handle: Long) = executeOnce("pause", UnitResponseCallback) {
        uploadControllerPause = uploadControllerPauseRequest {
            uploadControllerHandle = handle
        }
    }

    suspend fun resume(handle: Long) = executeOnce("resume", UnitResponseCallback) {
        uploadControllerResume = uploadControllerResumeRequest {
            uploadControllerHandle = handle
        }
    }

    fun free(handle: Long) {
        dispatch("free") {
            uploadControllerFree = uploadControllerFreeRequest {
                uploadControllerHandle = handle
            }
        }
        releaseAll()
    }
}
