package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonSdkError
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ChecksumMismatchErrorData.toEntity() = ProtonSdkError.Data.ChecksumMismatch(
    actualChecksum = takeIf { hasActualChecksum() }?.actualChecksum?.toByteArray(),
    expectedChecksum = takeIf { hasExpectedChecksum() }?.expectedChecksum?.toByteArray(),
)
