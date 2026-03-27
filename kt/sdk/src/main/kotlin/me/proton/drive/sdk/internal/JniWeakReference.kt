package me.proton.drive.sdk.internal

object JniWeakReference {

    @JvmStatic
    external fun create(obj: Any): Long

    @JvmStatic
    external fun delete(ref: Long)
}
