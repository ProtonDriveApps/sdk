package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.ApiRetrySucceededEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ApiRetrySucceededEventPayload.toEvent() = ApiRetrySucceededEvent(
    url = url,
    failedAttempts = failedAttempts,
)
