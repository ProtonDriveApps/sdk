package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProgressUpdate
import kotlin.math.roundToLong
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ProgressUpdate.toEntity() = takeIf { it.bytesInTotal > 0 }?.run {
    ProgressUpdate(
        bytesCompleted = bytesCompleted,
        bytesInTotal = takeIf { hasBytesInTotal() }?.let { bytesInTotal }
    )
}

private const val BLOCK_SIZE = 1 shl 22 // 4 MiB

internal fun ProtonDriveSdk.ProgressUpdate.toPercentageString(): String = if (hasBytesInTotal() && bytesInTotal > 0) {
    (bytesCompleted * 100.0 / bytesInTotal).toInt().let { percentage -> "$percentage%" }
} else {
    (bytesCompleted.toDouble() / (BLOCK_SIZE)).roundToLong().let { blocks -> "indeterminate: $blocks" }
}
