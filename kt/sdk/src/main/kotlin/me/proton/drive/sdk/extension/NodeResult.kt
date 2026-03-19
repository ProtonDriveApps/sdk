package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonDriveException
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.entity.DriveError
import me.proton.drive.sdk.entity.NodeResult

fun NodeResult.getOrThrow(): NodeResult.Value = when (this) {
    is NodeResult.Value -> this
    is NodeResult.Error -> throw node.errors.toException("Node failure")
}

fun NodeResult.getOrNull(): NodeResult.Value? = when (this) {
    is NodeResult.Value -> this
    is NodeResult.Error -> null
}

private fun List<DriveError>.toException(message: String) = ProtonDriveSdkException(message).apply {
    this@toException.forEach { driveError ->
        addSuppressed(
            exception = ProtonDriveException(
                message = driveError.message,
                cause = driveError.innerError?.let {
                    ProtonDriveException(
                        message = it.message,
                        cause = it.innerError?.toException(),
                    )
                }
            )
        )
    }
}

fun DriveError.toException(message: String): ProtonDriveSdkException = ProtonDriveSdkException(
    message = message,
    cause = toException()
)

fun DriveError.toException(): ProtonDriveException = ProtonDriveException(
    message = message,
    cause = innerError?.toException()
)
