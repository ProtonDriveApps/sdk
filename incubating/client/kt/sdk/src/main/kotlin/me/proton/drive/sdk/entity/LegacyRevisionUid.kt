package me.proton.drive.sdk.entity

data class LegacyRevisionUid(
    override val value: String,
) : LegacyUid(value, numberOfParts = 3), RevisionUid {

    val nodeUid: NodeUid by lazy {
        LegacyNodeUid(
            volumeId = parts[0],
            linkId = parts[1],
        )
    }

    val revisionId: String get() = parts[2]

    constructor(
        volumeId: String,
        linkId: String,
        revisionId: String,
    ) : this(create(volumeId, linkId, revisionId))
}
