package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.SessionResumeRequest
import proton.sdk.sessionResumeRequest

internal fun SessionResumeRequest.toProtobuf() = sessionResumeRequest {
    sessionId = this@toProtobuf.sessionId
    username = this@toProtobuf.username
    appVersion = this@toProtobuf.appVersion
    userId = this@toProtobuf.userId
    accessToken = this@toProtobuf.accessToken
    refreshToken = this@toProtobuf.refreshToken
    scopes.addAll(this@toProtobuf.scopes)
    isWaitingForSecondFactorCode = this@toProtobuf.isWaitingForSecondFactorCode
    isWaitingForDataPassword = this@toProtobuf.isWaitingForDataPassword
    secretCachePath = this@toProtobuf.secretCachePath
    options = this@toProtobuf.options.toProtobuf()
}
