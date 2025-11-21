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

import com.google.protobuf.kotlin.toByteString
import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.extension.toException
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.Response.ResultCase.ERROR
import proton.sdk.ProtonSdk.Response.ResultCase.RESULT_NOT_SET
import proton.sdk.ProtonSdk.Response.ResultCase.VALUE
import java.nio.ByteBuffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Suppress("TooGenericExceptionCaught")
class ContinuationUnitOrErrorResponse(
    private val deferred: CancellableContinuation<Unit>,
) : ResponseCallback {
    override fun invoke(data: ByteBuffer) {
        try {
            val parseFrom = ProtonSdk.Response.parseFrom(data)
            when (parseFrom.resultCase) {
                VALUE -> deferred.resumeWithException(
                    ProtonDriveSdkException("No response was expected but: ${parseFrom.value.typeUrl}")
                )

                RESULT_NOT_SET -> deferred.resume(Unit)
                ERROR -> deferred.resumeWithException(parseFrom.error.toException())
                null -> deferred.resumeWithException(ProtonDriveSdkException("No response (null)"))
            }
        } catch (error: Throwable) {
            deferred.resumeWithException(
                ProtonDriveSdkException(
                    message = "Cannot parse message: ${data.toByteString().toStringUtf8()}",
                    cause = error,
                )
            )
        }
    }
}
