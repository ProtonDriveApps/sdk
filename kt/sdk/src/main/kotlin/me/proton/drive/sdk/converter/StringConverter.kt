package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import com.google.protobuf.StringValue

class StringConverter : AnyConverter<String> {
    override val typeUrl: String = "type.googleapis.com/google.protobuf.StringValue"

    override fun convert(any: Any): String = StringValue.parseFrom(any.value).value
}
