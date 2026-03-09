package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class TrashChildrenListConverter : AnyConverter<ProtonDriveSdk.TrashChildrenList> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.TrashChildrenList"

    override fun convert(any: Any): ProtonDriveSdk.TrashChildrenList =
        ProtonDriveSdk.TrashChildrenList.parseFrom(any.value)
}
