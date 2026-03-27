package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import me.proton.drive.sdk.LoggerProvider.Level.VERBOSE
import me.proton.drive.sdk.LoggerProvider.Level.WARN
import proton.drive.sdk.ProtonDriveSdk.Request
import proton.drive.sdk.RequestKt
import proton.drive.sdk.request
import java.nio.ByteBuffer

abstract class JniBaseProtonDriveSdk : JniBase() {

    private var released = false
    private var clients = emptyList<ProtonDriveSdkNativeClient<*>>()
    private var permanentClients = emptyList<ProtonDriveSdkNativeClient<*>>()

    fun dispatch(
        name: String,
        block: RequestKt.Dsl.() -> Unit,
    ) {
        check(released.not()) { "Cannot dispatch ${method(name)} after release" }
        val nativeClient = ProtonDriveSdkNativeClient<Nothing>(
            name = method(name),
            response = { client, _ ->
                client.release()
            },
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
        // Create the callback here to capture the call stack trace
        val responseCallback = callback(continuation)
        val nativeClient = ProtonDriveSdkNativeClient<Nothing>(
            name = method(name),
            response = { client, buffer ->
                client.release()
                clients -= client
                responseCallback(buffer)
            },
            logger = internalLogger,
        )
        clients += nativeClient
        nativeClient.handleRequest(request(block))
    }

    suspend fun <T, E> executeEnumerate(
        name: String,
        callback: (CancellableContinuation<T>) -> ResponseCallback,
        enumerate: suspend (E) -> Unit,
        parser: (ByteBuffer) -> E,
        coroutineScopeProvider: CoroutineScopeProvider,
        block: RequestKt.Dsl.() -> Unit,
    ): T = suspendCancellableCoroutine { continuation ->
        check(released.not()) { "Cannot executeOnce ${method(name)} after release" }
        // Create the callback here to capture the call stack trace
        val responseCallback = callback(continuation)
        val nativeClient = ProtonDriveSdkNativeClient(
            name = method(name),
            response = { client, buffer ->
                client.release()
                clients -= client
                responseCallback(buffer)
            },
            enumerateHandler = EnumerateHandler.create(enumerate, parser) ,
            logger = internalLogger,
            coroutineScopeProvider = coroutineScopeProvider,
        )
        clients += nativeClient
        nativeClient.handleRequest(request(block))
    }

    suspend fun <T> executePersistent(
        clientBuilder: (CancellableContinuation<T>) -> ProtonDriveSdkNativeClient<Nothing>,
        requestBuilder: (ProtonDriveSdkNativeClient<Nothing>) -> Request,
    ): T = suspendCancellableCoroutine { continuation ->
        val nativeClient = clientBuilder(continuation)
        check(released.not()) { "Cannot executePersistent ${method(nativeClient.name)} after release" }
        permanentClients += nativeClient
        nativeClient.handleRequest(requestBuilder(nativeClient))
    }

    fun releaseAll() {
        internalLogger(VERBOSE, "Releasing all for ${javaClass.simpleName}")
        released = true
        permanentClients.forEach { client ->
            client.release()
        }
        permanentClients = emptyList()
        if (clients.isNotEmpty()) {
            internalLogger(
                WARN,
                "Pending clients waiting for a response: ${clients.size}, ${clients.map { it.name }}"
            )
        }
    }
}
