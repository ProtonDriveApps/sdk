/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Core.
 *
 * Proton Core is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Core is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Core.  If not, see <https://www.gnu.org/licenses/>.
 */

package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
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
            logger = logger,
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
            logger = logger,
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
        logger("Releasing all for ${javaClass.simpleName}")
        released = true
        clients.forEach { client -> client.release() }
        clients = emptyList()
    }
}
