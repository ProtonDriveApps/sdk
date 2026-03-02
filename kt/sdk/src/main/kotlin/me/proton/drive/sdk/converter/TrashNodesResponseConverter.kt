package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class TrashNodesResponseConverter : AnyConverter<ProtonDriveSdk.TrashNodesResponse> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.TrashNodesResponse"

    override fun convert(any: Any): ProtonDriveSdk.TrashNodesResponse =
        ProtonDriveSdk.TrashNodesResponse.parseFrom(any.value)
}
