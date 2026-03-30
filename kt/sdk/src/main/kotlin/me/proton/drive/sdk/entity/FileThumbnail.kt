package me.proton.drive.sdk.entity

data class FileThumbnail(
    val uid: NodeUid,
    val result: Result<ByteArray>
)
