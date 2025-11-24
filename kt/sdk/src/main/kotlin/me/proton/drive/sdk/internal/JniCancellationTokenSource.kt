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
