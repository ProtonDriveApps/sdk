package me.proton.drive.sdk

import me.proton.drive.sdk.telemetry.ApiRetrySucceededEvent
import me.proton.drive.sdk.telemetry.BlockVerificationErrorEvent
import me.proton.drive.sdk.telemetry.DecryptionErrorEvent
import me.proton.drive.sdk.telemetry.DownloadEvent
import me.proton.drive.sdk.telemetry.UploadEvent
import me.proton.drive.sdk.telemetry.VerificationErrorEvent

interface MetricCallback {
    fun onApiRetrySucceededEvent(event: ApiRetrySucceededEvent)
    fun onBlockVerificationErrorEvent(event: BlockVerificationErrorEvent)
    fun onDecryptionErrorEvent(event: DecryptionErrorEvent)
    fun onDownloadEvent(event: DownloadEvent)
    fun onUploadEvent(event: UploadEvent)
    fun onVerificationErrorEvent(event: VerificationErrorEvent)
}
