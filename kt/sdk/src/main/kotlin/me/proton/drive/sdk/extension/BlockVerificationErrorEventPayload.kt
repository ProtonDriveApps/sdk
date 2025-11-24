package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.BlockVerificationErrorEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.BlockVerificationErrorEventPayload.toEvent() = BlockVerificationErrorEvent(
    retryHelped = retryHelped,
)
