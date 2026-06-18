package me.proton.drive.sdk

import me.proton.drive.sdk.internal.JniLoggerProvider

typealias SdkLogger = (level: LoggerProvider.Level, category: String, message: String) -> Unit

class LoggerProvider internal constructor(
    internal val handle: Long,
    private val bridge: JniLoggerProvider
) {

    enum class Level {
        VERBOSE, DEBUG, INFO, WARN, ERROR,
    }
}
