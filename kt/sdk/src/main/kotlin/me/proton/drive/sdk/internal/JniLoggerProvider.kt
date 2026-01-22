package me.proton.drive.sdk.internal

import com.google.protobuf.InvalidProtocolBufferException
import me.proton.drive.sdk.LoggerProvider
import me.proton.drive.sdk.SdkLogger
import me.proton.drive.sdk.extension.decodeToString
import me.proton.drive.sdk.extension.toLongResponse
import proton.sdk.ProtonSdk
import proton.sdk.loggerProviderCreate
import proton.sdk.request
import java.nio.ByteBuffer

class JniLoggerProvider internal constructor(
    private val sdkLogger: SdkLogger,
) : JniBaseProtonSdk() {

    init {
        globalSdkLogger = sdkLogger
    }

    suspend fun create(): Long = executePersistent(
        clientBuilder = { continuation ->
            ProtonSdkNativeClient(
                name = method("create"),
                response = continuation.toLongResponse().asClientResponseCallback(),
                callback = ::onLog,
            )
        },
        requestBuilder = { client ->
            request {
                loggerProviderCreate = loggerProviderCreate {
                    logAction = ProtonSdkNativeClient.getCallbackPointer()
                }
            }
        }
    )

    fun onLog(logEventMessage: ByteBuffer) {
        try {
            val logEvent = ProtonSdk.LogEvent.parseFrom(logEventMessage)

            val priority = when (logEvent.level) {
                0 -> LoggerProvider.Level.VERBOSE
                1 -> LoggerProvider.Level.DEBUG
                2 -> LoggerProvider.Level.INFO
                3 -> LoggerProvider.Level.WARN
                4, 5 -> LoggerProvider.Level.ERROR
                else -> return
            }

            sdkLogger(priority, logEvent.categoryName, logEvent.message)
        } catch (error: InvalidProtocolBufferException) {
            sdkLogger(
                LoggerProvider.Level.ERROR,
                "parsing",
                error.message + "\n" + logEventMessage.decodeToString()
            )
        }
    }
}
