package me.proton.drive.sdk

class ProtonDriveSdkException(
    override val message: String? = null,
    override val cause: Throwable? = null,
    val error: ProtonSdkError? = null
) : Throwable(message, cause) {
    override fun toString(): String {
        return buildString {
            appendLine(super.toString())
            appendError(error)
        }
    }
}

private fun StringBuilder.appendError(error: ProtonSdkError?) {
    error?.run {
        appendLine("type: $type")
        appendLine("domain: $domain")
        appendLine("primaryCode: $primaryCode")
        appendLine("secondaryCode: $secondaryCode")
        appendLine("additionalData: $additionalData")
        appendLine(context)
        if (innerError != null) {
            appendLine("Caused by: ${innerError.message}")
            appendError(innerError)
        }
    }
}
