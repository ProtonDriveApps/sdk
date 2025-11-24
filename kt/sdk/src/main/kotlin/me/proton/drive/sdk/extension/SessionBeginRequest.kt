package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.SessionBeginRequest
import proton.sdk.sessionBeginRequest

fun SessionBeginRequest.toProtobuf(cancellationTokenSourceHandle: Long) = sessionBeginRequest {
    this@sessionBeginRequest.username = this@toProtobuf.username
    this@sessionBeginRequest.password = this@toProtobuf.password
    appVersion = this@toProtobuf.appVersion
    options = this@toProtobuf.options.toProtobuf()
    secretCachePath = secretCache.path
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
}
