package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.VerificationErrorEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.VerificationErrorEventPayload.toEvent() = VerificationErrorEvent(
    volumeType = volumeType.toEnum(),
    field = field.toEnum(),
    fromBefore2024 = fromBefore2024,
    addressMatchingDefaultShare = addressMatchingDefaultShare,
    error = error,
    uid = uid,
)
