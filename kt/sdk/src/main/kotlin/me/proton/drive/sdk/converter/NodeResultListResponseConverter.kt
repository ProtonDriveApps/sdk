package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class NodeResultListResponseConverter : AnyConverter<ProtonDriveSdk.NodeResultListResponse> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.NodeResultListResponse"

    override fun convert(any: Any): ProtonDriveSdk.NodeResultListResponse =
        ProtonDriveSdk.NodeResultListResponse.parseFrom(any.value)
}
