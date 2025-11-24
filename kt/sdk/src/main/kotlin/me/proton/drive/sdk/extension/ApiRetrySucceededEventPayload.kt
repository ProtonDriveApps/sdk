package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.ApiRetrySucceededEvent
import proton.sdk.ProtonSdk

fun ProtonSdk.ApiRetrySucceededEventPayload.toEvent() = ApiRetrySucceededEvent(
    url = url,
    failedAttempts = failedAttempts,
)
