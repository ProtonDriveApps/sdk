package me.proton.drive.sdk.entity

import java.time.Instant

data class PhotosTimelineItem(
    val nodeUid: String,
    val captureTime: Instant,
)
