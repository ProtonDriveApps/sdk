package me.proton.drive.sdk.entity

data class LegacyDeviceUid(
    override val value: String,
) : LegacyUid(value, numberOfParts = 1), DeviceUid {

    val deviceId: String get() = parts[0]
}
