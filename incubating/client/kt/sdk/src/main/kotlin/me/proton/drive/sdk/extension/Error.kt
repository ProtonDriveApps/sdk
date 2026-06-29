package me.proton.drive.sdk.extension

import com.google.protobuf.Any
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.ProtonSdkError
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.additionalDataOrNull
import proton.drive.sdk.innerErrorOrNull

fun ProtonDriveSdk.Error.toException() =
    ProtonDriveSdkException(message, error = toError())

fun ProtonDriveSdk.Error.toError(): ProtonSdkError = ProtonSdkError(
    message = message,
    type = type,
    domain = toErrorDomain(),
    primaryCode = primaryCode,
    secondaryCode = secondaryCode,
    context = context,
    innerError = innerErrorOrNull?.toError(),
    additionalData = additionalDataOrNull?.toData()
)

private fun ProtonDriveSdk.Error.toErrorDomain() = when (domain) {
    ProtonDriveSdk.ErrorDomain.Undefined -> ProtonSdkError.ErrorDomain.Undefined
    ProtonDriveSdk.ErrorDomain.SuccessfulCancellation -> ProtonSdkError.ErrorDomain.SuccessfulCancellation
    ProtonDriveSdk.ErrorDomain.Api -> ProtonSdkError.ErrorDomain.Api
    ProtonDriveSdk.ErrorDomain.Network -> ProtonSdkError.ErrorDomain.Network
    ProtonDriveSdk.ErrorDomain.Transport -> ProtonSdkError.ErrorDomain.Transport
    ProtonDriveSdk.ErrorDomain.Serialization -> ProtonSdkError.ErrorDomain.Serialization
    ProtonDriveSdk.ErrorDomain.Cryptography -> ProtonSdkError.ErrorDomain.Cryptography
    ProtonDriveSdk.ErrorDomain.DataIntegrity -> ProtonSdkError.ErrorDomain.DataIntegrity
    ProtonDriveSdk.ErrorDomain.BusinessLogic -> ProtonSdkError.ErrorDomain.BusinessLogic
    ProtonDriveSdk.ErrorDomain.UNRECOGNIZED, null -> ProtonSdkError.ErrorDomain.UNRECOGNIZED
}

private fun Any.toData() = when (typeUrl) {
    "type.googleapis.com/proton.drive.sdk.NodeNameConflictErrorData" ->
        ProtonDriveSdk.NodeNameConflictErrorData.parseFrom(value).toEntity()

    "type.googleapis.com/proton.drive.sdk.MissingContentBlockErrorData" ->
        ProtonDriveSdk.MissingContentBlockErrorData.parseFrom(value).toEntity()

    "type.googleapis.com/proton.drive.sdk.ContentSizeMismatchErrorData" ->
        ProtonDriveSdk.ContentSizeMismatchErrorData.parseFrom(value).toEntity()

    "type.googleapis.com/proton.drive.sdk.ThumbnailCountMismatchErrorData" ->
        ProtonDriveSdk.ThumbnailCountMismatchErrorData.parseFrom(value).toEntity()

    "type.googleapis.com/proton.drive.sdk.ChecksumMismatchErrorData" ->
        ProtonDriveSdk.ChecksumMismatchErrorData.parseFrom(value).toEntity()

    "type.googleapis.com/proton.drive.sdk.NodeNotFoundErrorData" ->
        ProtonDriveSdk.NodeNotFoundErrorData.parseFrom(value).toEntity()

    else -> null
}
