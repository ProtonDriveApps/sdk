package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.DownloadEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.DownloadEventPayload.toEvent() = DownloadEvent(
    volumeType = volumeType.toEnum(),
    claimedFileSize = claimedFileSize,
    downloadedSize = downloadedSize,
    error = takeIf { hasError() }?.error?.toEnum(),
    originalError = takeIf { hasOriginalError() }?.originalError,
)
