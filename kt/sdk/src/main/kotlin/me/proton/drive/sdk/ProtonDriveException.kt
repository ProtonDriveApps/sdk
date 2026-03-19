package me.proton.drive.sdk

import me.proton.drive.sdk.entity.Author

open class ProtonDriveException(
    override val message: String? = null,
    override val cause: Throwable? = null,
) : Throwable(
    /* message = */ message,
    /* cause = */ cause,
    /* enableSuppression = */ true,
    /* writableStackTrace = */ false,
)

class SignatureVerificationException(
    val claimedAuthor: Author,
    override val message: String? = null,
    override val cause: Throwable? = null,
) : ProtonDriveException(message, cause)
