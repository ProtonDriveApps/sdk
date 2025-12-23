package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import proton.sdk.ProtonSdk.Request
import proton.sdk.RequestKt
import proton.sdk.request

abstract class JniBaseProtonSdk : JniBase() {

    private var clients = emptyList<ProtonSdkNativeClient>()

    fun dispatch(
        name: String,
        block: RequestKt.Dsl.() -> Unit,
    ) {
        val nativeClient = ProtonSdkNativeClient(
            method(name),
            IgnoredIntegerOrErrorResponse(),
        )
        nativeClient.handleRequest(request(block))
    }

    suspend fun <T> executeOnce(
        name: String,
        callback: (CancellableContinuation<T>) -> ResponseCallback,
        block: RequestKt.Dsl.() -> Unit,
    ): T = suspendCancellableCoroutine { continuation ->
        val nativeClient = ProtonSdkNativeClient(
            name = method(name),
            response = callback(continuation),
            logger = internalLogger,
        )
        continuation.invokeOnCancellation { nativeClient.release() }
        nativeClient.handleRequest(request(block))
    }

    suspend fun <T> executeOnce(
        clientBuilder: (CancellableContinuation<T>) -> ProtonSdkNativeClient,
        requestBuilder: (ProtonSdkNativeClient) -> Request,
    ): T = suspendCancellableCoroutine { continuation ->
        val nativeClient = clientBuilder(continuation)
        continuation.invokeOnCancellation { nativeClient.release() }
        nativeClient.handleRequest(requestBuilder(nativeClient))
    }

    suspend fun <T> executePersistent(
        clientBuilder: (CancellableContinuation<T>) -> ProtonSdkNativeClient,
        requestBuilder: (ProtonSdkNativeClient) -> Request,
    ): T = suspendCancellableCoroutine { continuation ->
        val nativeClient = clientBuilder(continuation)
        clients += nativeClient
        nativeClient.handleRequest(requestBuilder(nativeClient))
    }

    fun releaseAll() {
        clients.forEach { client -> client.release() }
        clients = emptyList()
    }
}
