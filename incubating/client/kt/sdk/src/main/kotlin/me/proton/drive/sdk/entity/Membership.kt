package me.proton.drive.sdk.entity

import java.time.Instant

data class Membership(
    val role: MemberRole,
    val inviteTime: Instant,
    val sharedBy: Result<Author>,
)
