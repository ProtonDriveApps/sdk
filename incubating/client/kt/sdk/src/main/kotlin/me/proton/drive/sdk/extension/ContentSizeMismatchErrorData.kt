package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonSdkError
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ContentSizeMismatchErrorData.toEntity() = ProtonSdkError.Data.ContentSizeMismatch(
    uploadedSize = takeIf { hasUploadedSize() }?.uploadedSize,
    expectedSize = takeIf { hasExpectedSize() }?.expectedSize,
)
