package me.proton.drive.sdk.internal

class JniNativeLibrary internal constructor() {

    external fun overrideName(
        libraryName: ByteArray,
        overridingLibraryName: ByteArray,
    )
}
