package me.proton.drive.sdk.internal

import me.proton.drive.sdk.LoggerProvider.Level
import me.proton.drive.sdk.LoggerProvider.Level.VERBOSE
import proton.sdk.ProtonSdk.Request
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

class ProtonSdkNativeClient internal constructor(
    val name: String,
    val response: ClientResponseCallback<ProtonSdkNativeClient> = { _, _ -> error("response not configured for $name") },
    val callback: (ByteBuffer) -> Unit = { error("callback not configured for $name") },
    val logger: (Level, String) -> Unit = { _, _ -> }
) {
    private val clientWeakRef: Long = JniWeakReference.create(this)
    private val released = AtomicBoolean(false)

    fun release() {
        if (released.compareAndSet(false, true)) {
            JniWeakReference.delete(clientWeakRef)
        } else {
            logger(VERBOSE, "Native client for $name already release")
        }
    }

    fun handleRequest(
        request: Request,
    ) {
        logger(VERBOSE, "handle request ${request.payloadCase.name} for $name")
        handleRequest(clientWeakRef, request.toByteArray())
    }

    @Suppress("unused") // Called by JNI
    fun onResponse(data: ByteBuffer) {
        logger(VERBOSE, "response for $name of size: ${data.capacity()}")
        response(this, data)
    }

    @Suppress("unused") // Called by JNI
    fun onCallback(data: ByteBuffer) {
        logger(VERBOSE, "callback for $name of size: ${data.capacity()}")
        callback(data)
    }

    companion object {
        @JvmStatic
        external fun handleRequest(ref: Long, request: ByteArray)

        @JvmStatic
        external fun getCallbackPointer(): Long
    }
}
