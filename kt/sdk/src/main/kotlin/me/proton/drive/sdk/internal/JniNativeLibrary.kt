package me.proton.drive.sdk.internal

object JniNativeLibrary {

    @JvmStatic
    external fun overrideName(
        libraryName: ByteArray,
        overridingLibraryName: ByteArray,
    )
}
