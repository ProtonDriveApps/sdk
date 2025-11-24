package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.DecryptionErrorEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.DecryptionErrorEventPayload.toEvent() = DecryptionErrorEvent(
    volumeType = volumeType.toEnum(),
    field = field.toEnum(),
    fromBefore2024 = fromBefore2024,
    error = error,
    uid = uid,
)
