package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import java.nio.ByteBuffer
import java.nio.channels.ReadableByteChannel

internal interface HttpStream : AutoCloseable {

    suspend fun read(sdkContentHandle: Long, buffer: ByteBuffer): Int

    fun write(
        coroutineScope: CoroutineScope,
        channel: ReadableByteChannel,
        onDispose: suspend () -> Unit,
    ): Long
}
