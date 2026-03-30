package me.proton.drive.sdk.entity

data class LegacyNodeUid(
    override val value: String,
) : LegacyUid(value, numberOfParts = 2), NodeUid {

    val volumeId: String get() = parts[0]
    val linkId: String get() = parts[1]

    constructor(
        volumeId: String,
        linkId: String,
    ) : this(create(volumeId, linkId))
}
