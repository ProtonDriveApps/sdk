package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class DeviceConverter : AnyConverter<ProtonDriveSdk.Device> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.Device"

    override fun convert(any: Any): ProtonDriveSdk.Device =
        ProtonDriveSdk.Device.parseFrom(any.value)
}
