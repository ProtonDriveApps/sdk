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
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.ProtonSdkError
import proton.drive.sdk.ProtonDriveSdk
import proton.sdk.ProtonSdk
import proton.sdk.additionalDataOrNull
import proton.sdk.innerErrorOrNull

fun ProtonSdk.Error.toException() =
    ProtonDriveSdkException(message, error = toError())

fun ProtonSdk.Error.toError(): ProtonSdkError = ProtonSdkError(
    message = message,
    type = type,
    domain = toErrorDomain(),
    primaryCode = primaryCode,
    secondaryCode = secondaryCode,
    context = context,
    innerError = innerErrorOrNull?.toError(),
    additionalData = additionalDataOrNull?.toData()
)

private fun ProtonSdk.Error.toErrorDomain() = when (domain) {
    ProtonSdk.ErrorDomain.Undefined -> ProtonSdkError.ErrorDomain.Undefined
    ProtonSdk.ErrorDomain.SuccessfulCancellation -> ProtonSdkError.ErrorDomain.SuccessfulCancellation
    ProtonSdk.ErrorDomain.Api -> ProtonSdkError.ErrorDomain.Api
    ProtonSdk.ErrorDomain.Network -> ProtonSdkError.ErrorDomain.Network
    ProtonSdk.ErrorDomain.Transport -> ProtonSdkError.ErrorDomain.Transport
    ProtonSdk.ErrorDomain.Serialization -> ProtonSdkError.ErrorDomain.Serialization
    ProtonSdk.ErrorDomain.Cryptography -> ProtonSdkError.ErrorDomain.Cryptography
    ProtonSdk.ErrorDomain.DataIntegrity -> ProtonSdkError.ErrorDomain.DataIntegrity
    ProtonSdk.ErrorDomain.BusinessLogic -> ProtonSdkError.ErrorDomain.BusinessLogic
    ProtonSdk.ErrorDomain.UNRECOGNIZED, null -> ProtonSdkError.ErrorDomain.UNRECOGNIZED
}

private fun Any.toData() = when (typeUrl) {
    "type.googleapis.com/proton.drive.sdk.NodeNameConflictErrorData" ->
        ProtonDriveSdk.NodeNameConflictErrorData.parseFrom(value).toEntity()

    else -> null
}
