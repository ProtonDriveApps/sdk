package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import me.proton.drive.sdk.LoggerProvider.Level.ERROR
import me.proton.drive.sdk.LoggerProvider.Level.VERBOSE
import me.proton.drive.sdk.LoggerProvider.Level.WARN
import me.proton.drive.sdk.extension.resumeWithReleaseException
import proton.drive.sdk.ProtonDriveSdk.Request
import proton.drive.sdk.RequestKt
import proton.drive.sdk.request
import java.nio.ByteBuffer

abstract class JniBaseProtonDriveSdk : JniBase() {

    private val queue = TaskQueue { error -> internalLogger(ERROR, "Task failed: ${error.stackTraceToString()}") }
    private var clients = emptyList<ProtonDriveSdkNativeClient<*>>()
    private var permanentClients = emptyList<ProtonDriveSdkNativeClient<*>>()

    internal fun dispatch(
        name: String,
        block: RequestKt.Dsl.() -> Unit,
    ) {
        val submitted = queue.submit { internalDispatch(name, block) }
        if (!submitted) {
            logDropped("dispatch", name)
        }
    }

    internal fun dispatchAndRelease(
        name: String,
        block: RequestKt.Dsl.() -> Unit,
    ) {
        val submitted = queue.submit {
            if (queue.isClosed) {
                logDropped("dispatchAndRelease", name)
                return@submit
            }
            internalDispatch(name, block)
            internalReleaseAll()
        }
        if (!submitted) {
            logDropped("dispatchAndRelease", name)
        }
    }

    internal suspend fun <T> executeOnce(
        name: String,
        callback: (CancellableContinuation<T>) -> ResponseCallback,
        block: RequestKt.Dsl.() -> Unit,
    ): T = suspendCancellableCoroutine { continuation ->
        // Create the callback here to capture the call stack trace
        val responseCallback = callback(continuation)
        val submitted = queue.submit {
            if (queue.isClosed) {
                continuation.resumeWithReleaseException("executeOnce ${method(name)}")
                return@submit
            }
            val nativeClient = ProtonDriveSdkNativeClient<Nothing>(
                name = method(name),
                response = { client, buffer ->
                    client.release()
                    forget(client)
                    responseCallback(buffer)
                },
                logger = internalLogger,
            )
            clients += nativeClient
            nativeClient.handleRequest(request(block))
        }
        if (!submitted) {
            continuation.resumeWithReleaseException("executeOnce ${method(name)}")
        }
    }

    internal suspend fun <T> executeOnce(
        name: String,
        clientBuilder: (CancellableContinuation<T>, ResponseCallback.() -> ClientResponseCallback<ProtonDriveSdkNativeClient<Nothing>>) -> ProtonDriveSdkNativeClient<Nothing>,
        requestBuilder: (ProtonDriveSdkNativeClient<Nothing>) -> Request,
    ): T = suspendCancellableCoroutine { continuation ->
        val nativeClient = clientBuilder(continuation) {
            { client, buffer ->
                this(buffer)
                client.release()
                forget(client)
            }
        }
        val submitted = queue.submit {
            if (queue.isClosed) {
                nativeClient.release()
                continuation.resumeWithReleaseException("executeOnce ${method(name)}")
                return@submit
            }
            clients += nativeClient
            nativeClient.handleRequest(requestBuilder(nativeClient))
        }
        if (!submitted) {
            nativeClient.release()
            continuation.resumeWithReleaseException("executeOnce ${method(name)}")
        }
    }

    @Suppress("LongParameterList")
    internal suspend fun <T, E> executeEnumerate(
        name: String,
        callback: (CancellableContinuation<T>) -> ResponseCallback,
        yield: suspend (E) -> Unit,
        parser: (ByteBuffer) -> E,
        coroutineScopeProvider: CoroutineScopeProvider,
        block: RequestKt.Dsl.() -> Unit,
    ): T = suspendCancellableCoroutine { continuation ->
        // Create the callback here to capture the call stack trace
        val responseCallback = callback(continuation)
        val submitted = queue.submit {
            if (queue.isClosed) {
                continuation.resumeWithReleaseException("executeEnumerate ${method(name)}")
                return@submit
            }
            val nativeClient = ProtonDriveSdkNativeClient(
                name = method(name),
                response = { client, buffer ->
                    client.release()
                    forget(client)
                    responseCallback(buffer)
                },
                yieldHandler = YieldHandler.create(yield, parser),
                logger = internalLogger,
                coroutineScopeProvider = coroutineScopeProvider,
            )
            clients += nativeClient
            nativeClient.handleRequest(request(block))
        }
        if (!submitted) {
            continuation.resumeWithReleaseException("executeEnumerate ${method(name)}")
        }
    }

    internal suspend fun <T> executePersistent(
        name: String,
        clientBuilder: (CancellableContinuation<T>) -> ProtonDriveSdkNativeClient<Nothing>,
        requestBuilder: (ProtonDriveSdkNativeClient<Nothing>) -> Request,
    ): T = suspendCancellableCoroutine { continuation ->
        val nativeClient = clientBuilder(continuation)
        val submitted = queue.submit {
            if (queue.isClosed) {
                nativeClient.release()
                continuation.resumeWithReleaseException("executePersistent ${method(name)}")
                return@submit
            }
            permanentClients += nativeClient
            nativeClient.handleRequest(requestBuilder(nativeClient))
        }
        if (!submitted) {
            nativeClient.release()
            continuation.resumeWithReleaseException("executePersistent ${method(name)}")
        }
    }

    /** Releases without a native request, for subclasses that have nothing to free. */
    internal fun releaseAll() {
        queue.submit { internalReleaseAll() }
    }

    // Refused after release: the list is the only strong reference to a client awaiting its response.
    private fun forget(client: ProtonDriveSdkNativeClient<*>) {
        queue.submit { clients -= client }
    }

    private fun internalDispatch(name: String, block: RequestKt.Dsl.() -> Unit) {
        if (queue.isClosed) {
            logDropped("dispatch", name)
            return
        }
        val nativeClient = ProtonDriveSdkNativeClient<Nothing>(
            name = method(name),
            response = { client, _ ->
                client.release()
            },
            logger = internalLogger,
        )
        nativeClient.handleRequest(request(block))
    }

    private fun logDropped(operation: String, name: String) {
        internalLogger(WARN, "Dropped $operation ${method(name)}, cannot dispatch after release")
    }

    private fun internalReleaseAll() {
        queue.close()
        internalLogger(VERBOSE, "Releasing all for ${javaClass.simpleName}")
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
