package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import me.proton.drive.sdk.LoggerProvider.Level.WARN
import proton.sdk.ProtonSdk.Request
import proton.sdk.RequestKt
import proton.sdk.request

abstract class JniBaseProtonSdk : JniBase() {

    private var clients = emptyList<ProtonSdkNativeClient>()
    private var permanentClients = emptyList<ProtonSdkNativeClient>()

    fun dispatch(
        name: String,
        block: RequestKt.Dsl.() -> Unit,
    ) {
        val nativeClient = ProtonSdkNativeClient(
            name = method(name),
            response = { client, _ ->
                client.release()
            },
        )
        nativeClient.handleRequest(request(block))
    }

    suspend fun <T> executeOnce(
        name: String,
        callback: (CancellableContinuation<T>) -> ResponseCallback,
        block: RequestKt.Dsl.() -> Unit,
    ): T = suspendCancellableCoroutine { continuation ->
        // Create the callback here to capture the call stack trace
        val responseCallback = callback(continuation)
        val nativeClient = ProtonSdkNativeClient(
            name = method(name),
            response = { client, buffer ->
                responseCallback.invoke(buffer)
                client.release()
                clients -= client
            },
            logger = internalLogger,
        )
        clients += nativeClient
        nativeClient.handleRequest(request(block))
    }

    suspend fun <T> executeOnce(
        clientBuilder: (CancellableContinuation<T>, ResponseCallback.() -> ClientResponseCallback<ProtonSdkNativeClient>) -> ProtonSdkNativeClient,
        requestBuilder: (ProtonSdkNativeClient) -> Request,
    ): T = suspendCancellableCoroutine { continuation ->
        val nativeClient = clientBuilder(continuation) {
            { client, buffer ->
                this(buffer)
                client.release()
                clients -= client
            }
        }
        clients += nativeClient
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
        permanentClients.forEach { client -> client.release() }
        permanentClients = emptyList()
        if (clients.isNotEmpty()) {
            internalLogger(
                WARN,
                "Pending clients waiting for a response: ${clients.size}, ${clients.map { it.name }}"
            )
        }
    }
}
