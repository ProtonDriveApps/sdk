package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.OwnedBy
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.OwnedBy.toEntity() = OwnedBy(
    email = takeIf { hasEmail() }?.email,
    organization = takeIf { hasOrganization() }?.organization,
)
