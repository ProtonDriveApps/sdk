package me.proton.drive.sdk.entity

data class PhotosDownloaderRequest(
    val nodeUid: NodeUid,
    val noWaiting: Boolean? = null,
)
