package me.proton.drive.sdk.entity

data class FileUploaderRequest(
    val parentFolderUid: String,
    val name: String,
    val mediaType: String,
    val fileSize: Long,
    val lastModificationTime: Long,
    val overrideExistingDraftByOtherClient: Boolean,
    val additionalMetadata: Map<String, ByteArray> = emptyMap()
)
