package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.SessionRenewRequest
import proton.sdk.sessionRenewRequest

internal fun SessionRenewRequest.toProtobuf(handle: Long) = sessionRenewRequest {
    oldSessionHandle = handle
    sessionId = this@toProtobuf.sessionId
    accessToken = this@toProtobuf.accessToken
    refreshToken = this@toProtobuf.refreshToken
    scopes.addAll(this@toProtobuf.scopes)
    isWaitingForSecondFactorCode = this@toProtobuf.isWaitingForSecondFactorCode
    isWaitingForDataPassword = this@toProtobuf.isWaitingForDataPassword
}
