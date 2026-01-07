package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import com.google.protobuf.BoolValue

class BooleanConverter : AnyConverter<Boolean> {
    override val typeUrl: String = "type.googleapis.com/google.protobuf.BoolValue"

    override fun convert(any: Any): Boolean = BoolValue.parseFrom(any.value).value
}
