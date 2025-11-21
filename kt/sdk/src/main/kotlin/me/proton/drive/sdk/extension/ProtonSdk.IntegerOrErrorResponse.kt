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

import com.google.protobuf.Any
import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.ProtonDriveSdkException
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.Response.ResultCase.ERROR
import proton.sdk.ProtonSdk.Response.ResultCase.RESULT_NOT_SET
import proton.sdk.ProtonSdk.Response.ResultCase.VALUE
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

fun <T> ProtonSdk.Response.completeOrFail(deferred: CancellableContinuation<T>, block: (Any) -> T) {
    when (resultCase) {
        VALUE -> deferred.resume(block(value))
        RESULT_NOT_SET -> deferred.resumeWithException(ProtonDriveSdkException("No response (not set)"))
        ERROR -> deferred.resumeWithException(error.toException())
        null -> deferred.resumeWithException(ProtonDriveSdkException("No response (null)"))
    }
}
