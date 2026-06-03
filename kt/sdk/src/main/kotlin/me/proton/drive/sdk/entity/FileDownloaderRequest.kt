package me.proton.drive.sdk.entity

data class FileDownloaderRequest(
    val revisionUid: RevisionUid,
    val noWaiting: Boolean? = null,
)
