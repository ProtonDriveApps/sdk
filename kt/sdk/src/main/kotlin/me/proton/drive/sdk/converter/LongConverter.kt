package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import com.google.protobuf.Int64Value

class LongConverter : AnyConverter<Long> {
    override val typeUrl: String = "type.googleapis.com/google.protobuf.Int64Value"

    override fun convert(any: Any): Long = Int64Value.parseFrom(any.value).value
}
