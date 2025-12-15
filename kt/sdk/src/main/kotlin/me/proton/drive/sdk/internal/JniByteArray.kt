package me.proton.drive.sdk.internal

/**
 * JNI utility object for byte array operations.
 * Provides native memory management for byte arrays.
 */
object JniByteArray {

    /**
     * Allocates native memory and copies the byte array data into it.
     * @param data The byte array to copy
     * @return A pointer to the native memory, or 0 if allocation failed
     */
    @JvmStatic
    external fun getByteArray(data: ByteArray): Long

    /**
     * Releases native memory allocated by getByteArray.
     * @param pointer The pointer to native memory to release
     */
    @JvmStatic
    external fun releaseByteArray(pointer: Long)
}
