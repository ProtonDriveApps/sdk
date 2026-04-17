package me.proton.drive.sdk

import kotlinx.coroutines.flow.Flow
import me.proton.drive.sdk.entity.FileThumbnail
import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.entity.NodeResultPair
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.ThumbnailType

interface ProtonSdkClient : AutoCloseable {
    fun enumerateThumbnails(nodeUids: List<NodeUid>, type: ThumbnailType): Flow<FileThumbnail>
    suspend fun getNode(nodeUid: NodeUid): NodeResult?
    suspend fun trashNodes(nodeUids: List<NodeUid>): List<NodeResultPair>
    suspend fun deleteNodes(nodeUids: List<NodeUid>): List<NodeResultPair>
    suspend fun restoreNodes(nodeUids: List<NodeUid>): List<NodeResultPair>
    fun enumerateTrash(): Flow<NodeResult>
    suspend fun emptyTrash()
}
