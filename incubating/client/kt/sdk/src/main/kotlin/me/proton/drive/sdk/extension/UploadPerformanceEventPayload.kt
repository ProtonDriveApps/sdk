package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.UploadPerformanceEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadPerformanceEventPayload.toEvent() = UploadPerformanceEvent(
    metric = metric.toEnum(),
    value = value,
    uploadRoute = uploadRoute.toEnum(),
    sizeClass = sizeClass.toEnum(),
    blockCount = blockCount.toEnum(),
)
