package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class FolderChildrenListConverter : AnyConverter<ProtonDriveSdk.FolderChildrenList> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.FolderChildrenList"

    override fun convert(any: Any): ProtonDriveSdk.FolderChildrenList =
        ProtonDriveSdk.FolderChildrenList.parseFrom(any.value)
}
