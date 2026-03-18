package me.proton.drive.sdk.internal

import java.nio.ByteBuffer

interface EnumerateHandler<T> {
    val callback: suspend (T) -> Unit
    val parser: (ByteBuffer) -> T

    companion object {
        fun <T> notConfigured(name: String) = object:  EnumerateHandler<T> {
            override val callback: suspend (T) -> Unit
                get() = error("EnumerateHandler not configured for $name")
            override val parser: (ByteBuffer) -> T
                get() = error("EnumerateHandler not configured for $name")
        }
        fun <T> create(
            enumerate: suspend (T) -> Unit,
            parser: (ByteBuffer) -> T
        ) = object : EnumerateHandler<T> {
            override val callback = enumerate
            override val parser = parser
        }
    }
}
