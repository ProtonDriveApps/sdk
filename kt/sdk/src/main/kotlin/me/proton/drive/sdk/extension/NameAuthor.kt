package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.Author
import me.proton.drive.sdk.entity.AuthorResult
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.AuthorResult.toEntity() = AuthorResult(
    author = Author(emailAddress = author.emailAddress),
    signatureVerificationError = signatureVerificationError,
)
