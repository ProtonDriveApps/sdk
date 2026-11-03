package me.proton.drive.sdk.entity

import java.time.OffsetDateTime

data class FileRevisionUploaderRequest(
    val currentActiveRevisionUid: RevisionUid,
    val lastModificationTime: OffsetDateTime?,
    val size: Long,
    val noWaiting: Boolean? = null,
)
