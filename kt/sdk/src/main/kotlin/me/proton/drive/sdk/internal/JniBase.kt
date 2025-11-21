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

import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.SdkLogger
import java.nio.ByteBuffer

typealias ResponseCallback = (ByteBuffer) -> Unit

abstract class JniBase {

    open val logger: (String) -> Unit = { message -> globalSdkLogger(DEBUG, "internal", message) }

    internal fun method(name: String) = "${this.javaClass.simpleName}::$name"

    companion object {
        var globalSdkLogger: SdkLogger = { _, _, _ -> }
    }
}
