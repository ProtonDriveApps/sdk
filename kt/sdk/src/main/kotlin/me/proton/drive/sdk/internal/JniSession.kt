package me.proton.drive.sdk.internal

import me.proton.drive.sdk.entity.SessionBeginRequest
import me.proton.drive.sdk.entity.SessionRenewRequest
import me.proton.drive.sdk.entity.SessionResumeRequest
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.UnitResponseCallback
import me.proton.drive.sdk.extension.toProtobuf
import proton.sdk.sessionEndRequest
import proton.sdk.sessionFreeRequest

class JniSession internal constructor() : JniBaseProtonSdk() {

    suspend fun begin(
        cancellationTokenSourceHandle: Long,
        request: SessionBeginRequest,
    ): Long = executeOnce("begin", LongResponseCallback) {
        sessionBegin = request.toProtobuf(cancellationTokenSourceHandle)
    }

    suspend fun resume(
        request: SessionResumeRequest,
    ): Long = executeOnce("resume", LongResponseCallback) {
        sessionResume = request.toProtobuf()
    }

    suspend fun renew(
        handle: Long,
        request: SessionRenewRequest,
    ): Long = executeOnce("renew", LongResponseCallback) {
        sessionRenew = request.toProtobuf(handle)
    }

    suspend fun end(
        handle: Long,
    ) = executeOnce("end", UnitResponseCallback) {
        sessionEnd = sessionEndRequest { sessionHandle = handle }
    }

    fun free(handle: Long) {
        dispatch("free") {
            sessionFree = sessionFreeRequest { sessionHandle = handle }
        }
        releaseAll()
    }
}
