package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class FileThumbnailListConverter : AnyConverter<ProtonDriveSdk.FileThumbnailList> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.FileThumbnailList"

    override fun convert(any: Any): ProtonDriveSdk.FileThumbnailList = ProtonDriveSdk.FileThumbnailList.parseFrom(any.value)
}
