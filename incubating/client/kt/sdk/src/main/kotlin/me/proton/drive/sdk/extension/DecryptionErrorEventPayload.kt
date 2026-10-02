package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.DecryptionErrorEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.DecryptionErrorEventPayload.toEvent() = DecryptionErrorEvent(
    field = field.toEnum(),
    recency = recency.toEnum(),
    createdBy = createdBy.toEnum(),
    error = takeIf { hasError() }?.error,
    uid = uid,
)
