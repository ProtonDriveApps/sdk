package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class PhotosTimelineListConverter : AnyConverter<ProtonDriveSdk.PhotosTimelineList> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.PhotosTimelineList"

    override fun convert(any: Any): ProtonDriveSdk.PhotosTimelineList =
        ProtonDriveSdk.PhotosTimelineList.parseFrom(any.value)
}
