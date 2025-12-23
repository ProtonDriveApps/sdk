package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import me.proton.drive.sdk.LoggerProvider.Level
import me.proton.drive.sdk.LoggerProvider.Level.VERBOSE
import proton.drive.sdk.ProtonDriveSdk.Request
import proton.drive.sdk.RequestKt
import proton.drive.sdk.request

abstract class JniBaseProtonDriveSdk : JniBase() {

    private var released = false
    private var clients = emptyList<ProtonDriveSdkNativeClient>()

    fun dispatch(
        name: String,
        block: RequestKt.Dsl.() -> Unit,
    ) {
        check(released.not()) { "Cannot dispatch ${method(name)} after release" }
        val nativeClient = ProtonDriveSdkNativeClient(
            method(name),
            IgnoredIntegerOrErrorResponse(),
            logger = internalLogger,
        )
        nativeClient.handleRequest(request(block))
    }

    suspend fun <T> executeOnce(
        name: String,
        callback: (CancellableContinuation<T>) -> ResponseCallback,
        block: RequestKt.Dsl.() -> Unit,
    ): T = suspendCancellableCoroutine { continuation ->
        check(released.not()) { "Cannot executeOnce ${method(name)} after release" }
        val nativeClient = ProtonDriveSdkNativeClient(
            name = method(name),
            response = callback(continuation),
            logger = internalLogger,
        )
        continuation.invokeOnCancellation { nativeClient.release() }
        nativeClient.handleRequest(request(block))
    }

    suspend fun <T> executePersistent(
        clientBuilder: (CancellableContinuation<T>) -> ProtonDriveSdkNativeClient,
        requestBuilder: (ProtonDriveSdkNativeClient) -> Request,
    ): T = suspendCancellableCoroutine { continuation ->
        val nativeClient = clientBuilder(continuation)
        check(released.not()) { "Cannot executePersistent ${method(nativeClient.name)} after release" }
        clients += nativeClient
        nativeClient.handleRequest(requestBuilder(nativeClient))
    }

    fun releaseAll() {
        internalLogger(VERBOSE, "Releasing all for ${javaClass.simpleName}")
        released = true
        clients.forEach { client -> client.release() }
        clients = emptyList()
    }
}
