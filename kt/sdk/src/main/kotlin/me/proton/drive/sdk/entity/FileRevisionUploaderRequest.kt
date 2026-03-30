package me.proton.drive.sdk.entity

import java.time.Instant

data class FileRevisionUploaderRequest(
    val currentActiveRevisionUid: RevisionUid,
    val lastModificationTime: Instant,
    val size: Long,
)
