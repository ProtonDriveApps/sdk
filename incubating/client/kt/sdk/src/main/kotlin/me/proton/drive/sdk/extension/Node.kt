package me.proton.drive.sdk.extension

import me.proton.drive.sdk.ProtonDriveException
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.entity.DriveError
import me.proton.drive.sdk.entity.Node

fun Node.getNameOrNull(): String? = name.getOrNull()

fun Node.requireName(): String =
    name.getOrElse { throw errors.toException("Node name unavailable") }

fun Node.requireFullyProvisioned(): Node {
    if (name.isFailure) {
        throw name.exceptionOrNull() ?: errors.toException("Node name unavailable")
    }
    if (errors.isNotEmpty()) {
        throw errors.toException("Node failure")
    }
    return this
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
                },
            ),
        )
    }
}

fun DriveError.toException(message: String): ProtonDriveSdkException = ProtonDriveSdkException(
    message = "$message: ${this@toException.message}",
    cause = innerError?.toException(),
)

fun DriveError.toException(): ProtonDriveException = ProtonDriveException(
    message = message,
    cause = innerError?.toException(),
)
