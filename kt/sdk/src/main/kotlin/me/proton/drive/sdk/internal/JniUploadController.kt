package me.proton.drive.sdk.internal

import me.proton.drive.sdk.entity.UploadResult
import me.proton.drive.sdk.extension.UnitResponseCallback
import me.proton.drive.sdk.extension.UploadResultResponseCallback
import me.proton.drive.sdk.extension.toEntity
import proton.drive.sdk.uploadControllerAwaitCompletionRequest
import proton.drive.sdk.uploadControllerDisposeRequest
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

    suspend fun dispose(handle: Long) = executeOnce("dispose", UnitResponseCallback) {
        uploadControllerDispose = uploadControllerDisposeRequest {
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
