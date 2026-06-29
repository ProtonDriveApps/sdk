package me.proton.drive.sdk.internal

import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.UnitResponseCallback
import proton.drive.sdk.cancellationTokenSourceCancelRequest
import proton.drive.sdk.cancellationTokenSourceCreateRequest
import proton.drive.sdk.cancellationTokenSourceFreeRequest

class JniCancellationTokenSource internal constructor() : JniBaseProtonDriveSdk() {

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
