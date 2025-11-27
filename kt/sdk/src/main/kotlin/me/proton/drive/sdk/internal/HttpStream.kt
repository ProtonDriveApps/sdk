/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Drive.
 *
 * Proton Drive is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Drive is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Drive.  If not, see <https://www.gnu.org/licenses/>.
 */

package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import java.io.InputStream
import java.nio.ByteBuffer


class HttpStream internal constructor(
    private val bridge: JniHttpStream,
) : AutoCloseable {

    suspend fun read(sdkContentHandle: Long, buffer: ByteBuffer) =
        bridge.read(sdkContentHandle, buffer)

    fun write(coroutineScope: CoroutineScope, inputStream: InputStream): Long =
        bridge.write(coroutineScope, inputStream)

    override fun close() {
        bridge.release()
        bridge.releaseAll()
    }
}
