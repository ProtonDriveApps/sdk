package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class NodeResultConverter : AnyConverter<ProtonDriveSdk.NodeResult> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.NodeResult"

    override fun convert(any: Any): ProtonDriveSdk.NodeResult =
        ProtonDriveSdk.NodeResult.parseFrom(any.value)
}
