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

package me.proton.drive.sdk.extension

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import me.proton.drive.sdk.Cancellable

suspend fun <T, R> T.use(
    scope: CoroutineScope,
    block: suspend (T) -> R,
): R where T : Cancellable, T : AutoCloseable = use {
    try {
        block(this)
    } finally {
        if (!scope.isActive) {
            withContext(NonCancellable) {
                cancel()
            }
        }
    }
}


suspend fun <T, R> CoroutineScope.withCancellable(
    cancellable: T,
    block: suspend (T) -> R,
): R where T : Cancellable, T : AutoCloseable = cancellable.use {
    try {
        block(cancellable)
    } finally {
        if (!isActive) {
            withContext(NonCancellable) {
                cancellable.cancel()
            }
        }
    }
}
