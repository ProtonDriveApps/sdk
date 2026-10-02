package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.ItemCreator
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ItemCreator.toEnum() = when(this) {
    ProtonDriveSdk.ItemCreator.ITEM_CREATOR_UNSPECIFIED -> ItemCreator.UNSPECIFIED
    ProtonDriveSdk.ItemCreator.ITEM_CREATOR_FIRST_PARTY -> ItemCreator.FIRST_PARTY
    ProtonDriveSdk.ItemCreator.ITEM_CREATOR_THIRD_PARTY_WITH_SDK -> ItemCreator.THIRD_PARTY_WITH_SDK
    ProtonDriveSdk.ItemCreator.ITEM_CREATOR_THIRD_PARTY_WITHOUT_SDK -> ItemCreator.THIRD_PARTY_WITHOUT_SDK
    ProtonDriveSdk.ItemCreator.UNRECOGNIZED -> ItemCreator.UNRECOGNIZED
}
