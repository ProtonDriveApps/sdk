package me.proton.drive.sdk.entity

data class FileThumbnail(
    val uid: String,
    val result: Result<ByteArray>
)
