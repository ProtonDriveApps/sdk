package me.proton.drive.sdk.entity

interface DeviceUid : Uid

@Suppress("FunctionName")
fun DeviceUid(value: String): DeviceUid = LegacyDeviceUid(value)
