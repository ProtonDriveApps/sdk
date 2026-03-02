package me.proton.drive.sdk.entity

import me.proton.drive.sdk.ProtonDriveSdkException

sealed interface NodeResultPair {
    val nodeUid: String

    data class Success(override val nodeUid: String) : NodeResultPair
    data class Failure(override val nodeUid: String, val error: ProtonDriveSdkException) : NodeResultPair
}
