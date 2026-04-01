package me.proton.drive.sdk.internal

import java.nio.ByteBuffer

interface YieldHandler<T> {
    val callback: suspend (T) -> Unit
    val parser: (ByteBuffer) -> T

    companion object {
        fun <T> notConfigured(name: String) = object:  YieldHandler<T> {
            override val callback: suspend (T) -> Unit
                get() = error("YieldHandler not configured for $name")
            override val parser: (ByteBuffer) -> T
                get() = error("YieldHandler not configured for $name")
        }
        fun <T> create(
            callback: suspend (T) -> Unit,
            parser: (ByteBuffer) -> T
        ) = object : YieldHandler<T> {
            override val callback = callback
            override val parser = parser
        }
    }
}
