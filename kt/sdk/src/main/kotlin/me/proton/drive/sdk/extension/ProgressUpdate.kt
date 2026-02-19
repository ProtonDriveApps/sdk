package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProgressUpdate
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ProgressUpdate.toEntity() = takeIf { it.bytesInTotal > 0 }?.run {
    ProgressUpdate(
        bytesCompleted = bytesCompleted,
        bytesInTotal = bytesInTotal,
    )
}

internal fun ProtonDriveSdk.ProgressUpdate.toPercentageString(): String = if (bytesInTotal > 0) {
    (bytesCompleted * 100.0 / bytesInTotal).toInt()
} else {
    0
}.let { percentage -> "$percentage%" }
