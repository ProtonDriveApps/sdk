package me.proton.drive.sdk.extension

import me.proton.drive.sdk.SignatureVerificationException
import me.proton.drive.sdk.entity.Author
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.AuthorResult.toEntity(): Result<Author> =
    when (resultCase) {
        ProtonDriveSdk.AuthorResult.ResultCase.VALUE ->
            Result.success(value.toEntity())

        ProtonDriveSdk.AuthorResult.ResultCase.ERROR ->
            Result.failure(
                SignatureVerificationException(
                    claimedAuthor = error.claimedAuthor.toEntity(),
                    message = error.message
                )
            )

        ProtonDriveSdk.AuthorResult.ResultCase.RESULT_NOT_SET, null ->
            error("Invalid AuthorResult: result not set")
    }
