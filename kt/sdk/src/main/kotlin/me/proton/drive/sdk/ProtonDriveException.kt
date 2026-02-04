package me.proton.drive.sdk

import me.proton.drive.sdk.entity.Author

open class ProtonDriveException(
    override val message: String? = null,
    override val cause: Throwable? = null,
) : Throwable(message, cause)

class SignatureVerificationException(
    val claimedAuthor: Author,
    override val message: String? = null,
    override val cause: Throwable? = null,
) : ProtonDriveException(message, cause)
