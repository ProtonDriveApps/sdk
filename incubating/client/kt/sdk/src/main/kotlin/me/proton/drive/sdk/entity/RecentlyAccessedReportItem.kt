package me.proton.drive.sdk.entity

import java.time.Instant

data class RecentlyAccessedReportItem(
    val nodeUid: NodeUid,
    val accessTime: Instant? = null,
)
