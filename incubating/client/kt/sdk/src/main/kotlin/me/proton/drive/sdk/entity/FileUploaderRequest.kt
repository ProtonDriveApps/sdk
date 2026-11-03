package me.proton.drive.sdk.entity

import java.time.OffsetDateTime

data class FileUploaderRequest(
    val parentFolderUid: NodeUid,
    val name: String,
    val mediaType: String,
    val fileSize: Long,
    val lastModificationTime: OffsetDateTime?,
    val overrideExistingDraftByOtherClient: Boolean,
    val additionalMetadata: Map<String, ByteArray> = emptyMap(),
    val noWaiting: Boolean? = null,
)
