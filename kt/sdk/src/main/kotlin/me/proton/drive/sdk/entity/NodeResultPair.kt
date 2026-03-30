package me.proton.drive.sdk.entity

import me.proton.drive.sdk.ProtonDriveSdkException

sealed interface NodeResultPair {
    val nodeUid: NodeUid

    data class Success(override val nodeUid: NodeUid) : NodeResultPair
    data class Failure(override val nodeUid: NodeUid, val error: ProtonDriveSdkException) : NodeResultPair
}
