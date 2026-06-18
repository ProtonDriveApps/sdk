package me.proton.drive.sdk.extension

import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.StringResult.toEntity(): Result<String> =
    when (resultCase) {
        ProtonDriveSdk.StringResult.ResultCase.VALUE ->
            Result.success(value)

        ProtonDriveSdk.StringResult.ResultCase.ERROR ->
            Result.failure(error.toEntity().toException("String result failure"))

        ProtonDriveSdk.StringResult.ResultCase.RESULT_NOT_SET, null ->
            error("Invalid StringResult: result not set")
    }
