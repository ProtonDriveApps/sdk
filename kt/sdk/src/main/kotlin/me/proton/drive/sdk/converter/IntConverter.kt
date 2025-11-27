package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import com.google.protobuf.Int32Value

class IntConverter : AnyConverter<Int> {
    override val typeUrl: String = "type.googleapis.com/google.protobuf.Int32Value"

    override fun convert(any: Any): Int = Int32Value.parseFrom(any.value).value
}
