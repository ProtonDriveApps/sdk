package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.entity.FileThumbnail
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.FileThumbnail.toEntity(): FileThumbnail = FileThumbnail(
    uid = fileUid,
    result = when (resultCase) {
        ProtonDriveSdk.FileThumbnail.ResultCase.DATA -> Result.success(data.toByteArray())
        ProtonDriveSdk.FileThumbnail.ResultCase.ERROR -> Result.failure(
            error.toEntity().toException("File thumbnail failure")
        )
        else -> Result.failure(
            ProtonDriveSdkException(
                "Undefined result type for ${ProtonDriveSdk.FileThumbnail::class.simpleName}"
            )
        )
    }
)
