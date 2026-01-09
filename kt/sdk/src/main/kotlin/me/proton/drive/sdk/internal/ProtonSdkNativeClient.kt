package me.proton.drive.sdk.internal

import me.proton.drive.sdk.LoggerProvider.Level
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.LoggerProvider.Level.VERBOSE
import proton.sdk.ProtonSdk.Request
import java.nio.ByteBuffer

class ProtonSdkNativeClient internal constructor(
    val name: String,
    val response: ResponseCallback = { error("response not configured for $name") },
    val callback: (ByteBuffer) -> Unit = { error("callback not configured for $name") },
    val logger: (Level, String) -> Unit = { _, _ -> }
) {

    fun release() {
        // do nothing as C code use weak reference
        // keep this method to force user to keep a strong reference to the native client until they are done
    }

    fun handleRequest(
        request: Request,
    ) {
        logger(VERBOSE, "handle request ${request.payloadCase.name} for $name")
        handleRequest(request.toByteArray())
    }

    external fun handleRequest(
        request: ByteArray,
    )

    fun onResponse(data: ByteBuffer) {
        logger(VERBOSE, "response for $name of size: ${data.capacity()}")
        response(data)
    }

    fun onCallback(data: ByteBuffer) {
        logger(VERBOSE, "callback for $name of size: ${data.capacity()}")
        callback(data)
    }

    companion object {
        @JvmStatic
        external fun getCallbackPointer(): Long
    }
}
