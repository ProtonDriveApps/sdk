package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.VerificationErrorEvent
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.VerificationErrorEventPayload.toEvent() = VerificationErrorEvent(
    field = field.toEnum(),
    recency = recency.toEnum(),
    createdBy = createdBy.toEnum(),
    addressMatchingDefaultShare = addressMatchingDefaultShare,
    error = takeIf { hasError() }?.error,
    uid = uid,
)
