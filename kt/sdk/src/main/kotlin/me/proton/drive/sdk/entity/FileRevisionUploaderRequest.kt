package me.proton.drive.sdk.entity

import java.time.Instant

data class FileRevisionUploaderRequest(
    val currentActiveRevisionUid: String,
    val lastModificationTime: Instant,
    val size: Long,
)
