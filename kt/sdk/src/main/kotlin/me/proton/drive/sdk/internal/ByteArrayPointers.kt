package me.proton.drive.sdk.internal

/**
 * Manages native memory pointers for byte arrays allocated via JNI.
 * Tracks allocated pointers and ensures they are properly released.
 */
internal class ByteArrayPointers {

    private var pointers = emptyList<Long>()

    /**
     * Allocates native memory for a byte array and tracks the pointer.
     * @param data The byte array to copy to native memory
     * @return A pointer to the native memory
     */
    fun allocate(data: ByteArray): Long = JniByteArray.getByteArray(data).also { pointer ->
        pointers += pointer
    }

    /**
     * Releases all tracked native memory pointers.
     */
    fun releaseAll() {
        pointers.forEach { pointer ->
            JniByteArray.releaseByteArray(pointer)
        }
        pointers = emptyList()
    }
}
