package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.SessionBeginRequest
import proton.drive.sdk.account.sessionBeginRequest

fun SessionBeginRequest.toProtobuf(cancellationTokenSourceHandle: Long) = sessionBeginRequest {
    this@sessionBeginRequest.username = this@toProtobuf.username
    this@sessionBeginRequest.password = this@toProtobuf.password
    appVersion = this@toProtobuf.appVersion
    options = this@toProtobuf.options.toSessionOptionsProtobuf()
    this@toProtobuf.secretCachePath?.let { secretCachePath = it }
    this.cancellationTokenSourceHandle = cancellationTokenSourceHandle
}
