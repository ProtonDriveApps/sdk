package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.UploadEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadEventPayload.toEvent() = UploadEvent(
    volumeType = volumeType.toEnum(),
    expectedSize = expectedSize,
    uploadedSize = uploadedSize,
    approximateUploadedSize = approximateUploadedSize,
    error = takeIf { hasError() }?.error?.toEnum(),
    originalError = takeIf { hasOriginalError() }?.originalError,
)
