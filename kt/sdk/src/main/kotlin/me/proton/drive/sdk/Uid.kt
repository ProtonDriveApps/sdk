package me.proton.drive.sdk

object Uid {

    fun makeNodeUid(volumeId: String, nodeId: String) = makeUid(volumeId, nodeId)
    fun makeNodeRevisionUid(volumeId: String, nodeId: String, revisionId: String) =
        makeUid(volumeId, nodeId, revisionId)

    private fun makeUid(vararg ids: String) = ids.joinToString("~")
}
