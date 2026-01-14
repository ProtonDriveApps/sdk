package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class FolderNodeConverter : AnyConverter<ProtonDriveSdk.FolderNode> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.FolderNode"

    override fun convert(any: Any): ProtonDriveSdk.FolderNode =
        ProtonDriveSdk.FolderNode.parseFrom(any.value)
}
