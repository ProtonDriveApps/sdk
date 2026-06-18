package me.proton.drive.sdk

class ProtonDriveSdkException(
    override val message: String? = null,
    override val cause: Throwable? = null,
    val error: ProtonSdkError? = null
) : Throwable(message, cause) {
    override fun toString(): String = buildString {
        appendLine(super.toString())
        appendError(error, logMode = LogMode.Full)
    }
}

enum class LogMode {
    Safe, Full
}

fun ProtonDriveSdkException.errorToString(logMode: LogMode = LogMode.Safe): String = buildString {
    error?.let { error ->
        appendLine("SDK error: ${error.message}")
        appendError(error, logMode)
    }
}

private fun StringBuilder.appendError(error: ProtonSdkError?, logMode: LogMode) {
    error?.run {
        appendLine("type: $type")
        appendLine("domain: $domain")
        appendLine("primaryCode: $primaryCode")
        appendLine("secondaryCode: $secondaryCode")
        val data = when (logMode) {
            LogMode.Safe -> additionalData?.toSafe()
            LogMode.Full -> additionalData
        }
        appendLine("additionalData: ${data}")
        appendLine(context)
        if (innerError != null) {
            appendLine("Caused by: ${innerError.message}")
            appendError(innerError, logMode)
        }
    }
}
