package me.proton.drive.sdk

import me.proton.drive.sdk.extension.toEvent
import proton.drive.sdk.ProtonDriveSdk
import proton.sdk.ProtonSdk

class TelemetryBridge(
    private val callback: MetricCallback,
) : suspend (ProtonSdk.MetricEvent) -> Unit {
    override suspend fun invoke(event: ProtonSdk.MetricEvent) {
        val data = event.payload.value
        when (event.payload.typeUrl) {
            "type.googleapis.com/proton.sdk.ApiRetrySucceededEventPayload" -> callback.onApiRetrySucceededEvent(
                ProtonSdk.ApiRetrySucceededEventPayload.parseFrom(data).toEvent()
            )

            "type.googleapis.com/proton.drive.sdk.BlockVerificationErrorEventPayload" ->
                callback.onBlockVerificationErrorEvent(
                    ProtonDriveSdk.BlockVerificationErrorEventPayload.parseFrom(data).toEvent()
                )

            "type.googleapis.com/proton.drive.sdk.DecryptionErrorEventPayload" -> callback.onDecryptionErrorEvent(
                ProtonDriveSdk.DecryptionErrorEventPayload.parseFrom(data).toEvent()
            )

            "type.googleapis.com/proton.drive.sdk.DownloadEventPayload" -> callback.onDownloadEvent(
                ProtonDriveSdk.DownloadEventPayload.parseFrom(data).toEvent()
            )

            "type.googleapis.com/proton.drive.sdk.UploadEventPayload" -> callback.onUploadEvent(
                ProtonDriveSdk.UploadEventPayload.parseFrom(data).toEvent()
            )

            "type.googleapis.com/proton.drive.sdk.VerificationErrorEventPayload" -> callback.onVerificationErrorEvent(
                ProtonDriveSdk.VerificationErrorEventPayload.parseFrom(data).toEvent()
            )

            else -> error("Cannot parse ${event.name} (${event.payload.typeUrl})")
        }
    }
}
