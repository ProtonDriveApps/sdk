package me.proton.drive.sdk.internal

import me.proton.drive.sdk.LoggerProvider.Level
import me.proton.drive.sdk.SdkLogger
import java.nio.ByteBuffer

typealias ResponseCallback = (ByteBuffer) -> Unit
typealias ClientResponseCallback<T> = (T, ByteBuffer) -> Unit

fun <T> ResponseCallback.asClientResponseCallback(): ClientResponseCallback<T> = { _, buffer -> this(buffer)}

abstract class JniBase {

    open val internalLogger: (Level, String) -> Unit = { level, message ->
        globalSdkLogger(level, "internal", message)
    }

    open val clientLogger: (Level, String) -> Unit = { level, message ->
        globalSdkLogger(level, "client", message)
    }

    internal fun method(name: String) = "${this.javaClass.simpleName}::$name"

    companion object {
        var globalSdkLogger: SdkLogger = { _, _, _ -> }
    }
}
