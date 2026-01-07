package me.proton.drive.sdk.internal

import me.proton.drive.sdk.extension.BooleanResponseCallback
import me.proton.drive.sdk.extension.UnitResponseCallback
import proton.drive.sdk.downloadControllerAwaitCompletionRequest
import proton.drive.sdk.downloadControllerFreeRequest
import proton.drive.sdk.downloadControllerIsDownloadCompleteWithVerificationIssueRequest
import proton.drive.sdk.downloadControllerPauseRequest
import proton.drive.sdk.downloadControllerResumeRequest

class JniDownloadController internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun awaitCompletion(handle: Long) =
        executeOnce("awaitCompletion", UnitResponseCallback) {
            downloadControllerAwaitCompletion = downloadControllerAwaitCompletionRequest {
                downloadControllerHandle = handle
            }
        }

    suspend fun pause(handle: Long) = executeOnce("pause", UnitResponseCallback) {
        downloadControllerPause = downloadControllerPauseRequest {
            downloadControllerHandle = handle
        }
    }

    suspend fun resume(handle: Long) = executeOnce("resume", UnitResponseCallback) {
        downloadControllerResume = downloadControllerResumeRequest {
            downloadControllerHandle = handle
        }
    }

    suspend fun isDownloadCompleteWithVerificationIssue(handle: Long): Boolean =
        executeOnce("isDownloadCompleteWithVerificationIssue", BooleanResponseCallback) {
            downloadControllerIsDownloadCompleteWithVerificationIssue =
                downloadControllerIsDownloadCompleteWithVerificationIssueRequest {
                    downloadControllerHandle = handle
                }
        }

    fun free(handle: Long) {
        dispatch("free") {
            downloadControllerFree = downloadControllerFreeRequest {
                downloadControllerHandle = handle
            }
        }
        releaseAll()
    }
}
