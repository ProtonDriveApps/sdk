package me.proton.drive.sdk.entity

import java.time.Instant

data class AlbumItem(
    val nodeUid: NodeUid,
    val captureTime: Instant,
)
