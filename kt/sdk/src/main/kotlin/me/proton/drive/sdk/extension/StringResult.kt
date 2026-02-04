package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonDriveException
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.StringResult.toEntity(): Result<String> =
    when (resultCase) {
        ProtonDriveSdk.StringResult.ResultCase.VALUE ->
            Result.success(value)

        ProtonDriveSdk.StringResult.ResultCase.ERROR ->
            Result.failure(
                ProtonDriveException(error.message)
            )

        ProtonDriveSdk.StringResult.ResultCase.RESULT_NOT_SET, null ->
            error("Invalid StringResult: result not set")
    }
