package me.proton.drive.sdk.entity

data class LegacyParentNodeUid(
    override val value: String,
) : LegacyUid(value, numberOfParts = 2), ParentNodeUid {

    val volumeId: String get() = parts[0]
    val linkId: String get() = parts[1]

    constructor(
        volumeId: String,
        linkId: String,
    ) : this(create(volumeId, linkId))
}
