package me.proton.drive.sdk.entity

data class LegacyDeviceUid(
    override val value: String,
) : LegacyUid(value, numberOfParts = 2), DeviceUid {

    val volumeId: String get() = parts[0]
    val deviceId: String get() = parts[1]

    constructor(
        volumeId: String,
        deviceId: String,
    ) : this(create(volumeId, deviceId))
}
