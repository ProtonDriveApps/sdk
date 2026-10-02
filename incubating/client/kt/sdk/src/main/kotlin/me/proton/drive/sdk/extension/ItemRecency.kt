package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.ItemRecency
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ItemRecency.toEnum() = when(this) {
    ProtonDriveSdk.ItemRecency.ITEM_RECENCY_UNSPECIFIED -> ItemRecency.UNSPECIFIED
    ProtonDriveSdk.ItemRecency.ITEM_RECENCY_PAST_MONTH -> ItemRecency.PAST_MONTH
    ProtonDriveSdk.ItemRecency.ITEM_RECENCY_PAST_YEAR -> ItemRecency.PAST_YEAR
    ProtonDriveSdk.ItemRecency.ITEM_RECENCY_SINCE_2024 -> ItemRecency.SINCE_2024
    ProtonDriveSdk.ItemRecency.ITEM_RECENCY_BEFORE_2024 -> ItemRecency.BEFORE_2024
    ProtonDriveSdk.ItemRecency.UNRECOGNIZED -> ItemRecency.UNRECOGNIZED
}
