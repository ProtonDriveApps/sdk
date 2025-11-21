/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Drive.
 *
 * Proton Drive is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Drive is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Drive.  If not, see <https://www.gnu.org/licenses/>.
 */

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
