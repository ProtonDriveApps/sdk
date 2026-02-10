package me.proton.drive.sdk.entity

data class FileRevisionUploaderRequest(
    val currentActiveRevisionUid: String,
    val lastModificationTime: Long,
    val size: Long,
    val expectedSha1: ByteArray? = null,
)
