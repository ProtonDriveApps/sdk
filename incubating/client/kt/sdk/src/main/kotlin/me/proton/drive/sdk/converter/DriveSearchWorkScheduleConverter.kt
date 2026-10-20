package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import proton.drive.sdk.ProtonDriveSdk

class DriveSearchWorkScheduleConverter : AnyConverter<ProtonDriveSdk.DriveSearchWorkSchedule> {
    override val typeUrl: String = "type.googleapis.com/proton.drive.sdk.DriveSearchWorkSchedule"

    override fun convert(any: Any): ProtonDriveSdk.DriveSearchWorkSchedule =
        ProtonDriveSdk.DriveSearchWorkSchedule.parseFrom(any.value)
}
