package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class UploadResultConverter : AnyConverter<ProtonDriveSdk.UploadResult> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.UploadResult"

    override fun convert(any: Any): ProtonDriveSdk.UploadResult =
        ProtonDriveSdk.UploadResult.parseFrom(any.value)
}
