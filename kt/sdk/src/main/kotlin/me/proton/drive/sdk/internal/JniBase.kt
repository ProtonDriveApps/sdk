package me.proton.drive.sdk.internal

import me.proton.drive.sdk.LoggerProvider
import me.proton.drive.sdk.LoggerProvider.Level.VERBOSE
import me.proton.drive.sdk.SdkLogger
import java.nio.ByteBuffer

typealias ResponseCallback = (ByteBuffer) -> Unit

abstract class JniBase {

    open val logger: (String) -> Unit = { message -> globalSdkLogger(VERBOSE, "internal", message) }

    internal fun method(name: String) = "${this.javaClass.simpleName}::$name"

    companion object {
        var globalSdkLogger: SdkLogger = { _, _, _ -> }
    }
}
