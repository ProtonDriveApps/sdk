package me.proton.drive.sdk.entity

data class FileRevisionUploaderRequest(
    val currentActiveRevisionUid: String,
    val lastModificationTime: Long,
    val size: Long,
)
