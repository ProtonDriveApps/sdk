package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.Membership
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.Membership.toEntity() = Membership(
    role = role.toEntity(),
    inviteTime = inviteTime.toInstant(),
    sharedBy = sharedBy.toEntity(),
)
