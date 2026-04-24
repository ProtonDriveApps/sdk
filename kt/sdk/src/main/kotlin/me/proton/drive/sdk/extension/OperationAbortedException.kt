package me.proton.drive.sdk.extension

import me.proton.drive.sdk.OperationAbortedException
import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.ProtonSdkError

val OperationAbortedException.error: ProtonSdkError?
    get() {
        val abortedCause = cause
        return if (abortedCause is ProtonDriveSdkException) {
            abortedCause.error
        } else {
            null
        }
    }

