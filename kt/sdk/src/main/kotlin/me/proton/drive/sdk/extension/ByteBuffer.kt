package me.proton.drive.sdk.extension

import java.nio.ByteBuffer

internal fun ByteBuffer.decodeToString(): String {
    val bytes = ByteArray(remaining())
    get(bytes)
    return String(bytes, Charsets.UTF_8)
}
