package me.proton.drive.sdk.extension

import me.proton.drive.sdk.SignatureVerificationException
import me.proton.drive.sdk.entity.Author
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.AuthorResult.toEntity(): Result<Author> = if (signatureVerificationError.isEmpty()) {
    Result.success(author.toEntity())
} else {
    Result.failure(
        SignatureVerificationException(
            claimedAuthor = author.toEntity(),
            message = signatureVerificationError
        )
    )
}
