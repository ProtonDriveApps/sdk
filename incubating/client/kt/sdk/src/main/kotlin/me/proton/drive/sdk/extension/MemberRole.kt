package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.MemberRole
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.MemberRole.toEntity() = when (this) {
    ProtonDriveSdk.MemberRole.MEMBER_ROLE_INHERITED -> MemberRole.INHERITED
    ProtonDriveSdk.MemberRole.MEMBER_ROLE_VIEWER -> MemberRole.VIEWER
    ProtonDriveSdk.MemberRole.MEMBER_ROLE_EDITOR -> MemberRole.EDITOR
    ProtonDriveSdk.MemberRole.MEMBER_ROLE_ADMIN -> MemberRole.ADMIN
    ProtonDriveSdk.MemberRole.UNRECOGNIZED -> error("Invalid MemberRole: $this")
}
