package me.proton.drive.sdk.extension

import java.nio.channels.SeekableByteChannel

fun SeekableByteChannel.seek(offset: Long, origin: Int): Long {
    val newPosition = when (origin) {
        0 -> offset
        1 -> position() + offset
        2 -> size() + offset
        else -> throw IllegalArgumentException("Unknown seek origin: $origin")
    }
    return position(newPosition).position()
}
