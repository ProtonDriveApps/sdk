package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DriveSearchWorkSchedule
import proton.drive.sdk.ProtonDriveSdk
import java.time.Duration

fun ProtonDriveSdk.DriveSearchWorkSchedule.toEntity(): DriveSearchWorkSchedule =
    DriveSearchWorkSchedule(
        recommendedNextCallAfter = Duration.ofMillis(recommendedNextCallAfterMs),
    )
