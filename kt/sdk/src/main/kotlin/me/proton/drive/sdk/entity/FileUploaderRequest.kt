package me.proton.drive.sdk.entity

import java.time.Instant

data class FileUploaderRequest(
    val parentFolderUid: String,
    val name: String,
    val mediaType: String,
    val fileSize: Long,
    val lastModificationTime: Instant,
    val overrideExistingDraftByOtherClient: Boolean,
    val additionalMetadata: Map<String, ByteArray> = emptyMap(),
)
