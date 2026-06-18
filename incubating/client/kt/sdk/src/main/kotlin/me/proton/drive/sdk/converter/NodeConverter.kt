package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class NodeConverter : AnyConverter<ProtonDriveSdk.Node> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.Node"

    override fun convert(any: Any): ProtonDriveSdk.Node =
        ProtonDriveSdk.Node.parseFrom(any.value)
}
