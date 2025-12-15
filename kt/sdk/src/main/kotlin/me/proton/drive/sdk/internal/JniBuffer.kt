package me.proton.drive.sdk.internal

import java.nio.ByteBuffer

/**
 * JNI utility object for ByteBuffer operations.
 * Provides direct buffer pointer and size access for JNI.
 */
object JniBuffer {

    /**
     * Gets the native memory pointer from a direct ByteBuffer.
     * @param buffer The ByteBuffer to get the pointer from
     * @return A pointer to the buffer's native memory, or 0 if not a direct buffer
     */
    @JvmStatic
    external fun getBufferPointer(buffer: ByteBuffer): Long

    /**
     * Gets the capacity of a ByteBuffer.
     * @param buffer The ByteBuffer to get the size from
     * @return The capacity of the buffer in bytes
     */
    @JvmStatic
    external fun getBufferSize(buffer: ByteBuffer): Long
}
