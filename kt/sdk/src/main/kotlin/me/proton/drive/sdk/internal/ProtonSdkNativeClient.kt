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
