package me.proton.drive.sdk.internal

import proton.sdk.ProtonSdk.Request
import java.nio.ByteBuffer

class ProtonSdkNativeClient internal constructor(
    val name: String,
    val response: ResponseCallback = { error("response not configured for $name") },
    val callback: (ByteBuffer) -> Unit = { error("callback not configured for $name") },
    val logger: (String) -> Unit = {}
) {

    fun release() {
        // do nothing as C code use weak reference
        // keep this method to force user to keep a strong reference to the native client until they are done
    }

    fun handleRequest(
        request: Request,
    ) {
        logger("handle request ${request.payloadCase.name} for $name")
        handleRequest(request.toByteArray())
    }

    external fun handleRequest(
        request: ByteArray,
    )

    external fun getCallbackPointer(): Long

    fun onResponse(data: ByteBuffer) {
        logger("response for $name of size: ${data.capacity()}")
        response(data)
    }

    fun onCallback(data: ByteBuffer) {
        logger("callback for $name of size: ${data.capacity()}")
        callback(data)
    }
}
