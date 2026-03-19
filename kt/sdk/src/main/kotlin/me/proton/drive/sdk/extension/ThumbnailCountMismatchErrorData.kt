package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonSdkError
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ThumbnailCountMismatchErrorData.toEntity() = ProtonSdkError.Data.ThumbnailCountMismatch(
    uploadedBlockCount = takeIf { hasUploadedBlockCount() }?.uploadedBlockCount,
    expectedBlockCount = takeIf { hasExpectedBlockCount() }?.expectedBlockCount,
)
