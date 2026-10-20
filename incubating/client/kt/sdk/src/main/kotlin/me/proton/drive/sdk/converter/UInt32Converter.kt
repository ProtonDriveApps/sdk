package me.proton.drive.sdk.converter

import com.google.protobuf.Any
import com.google.protobuf.UInt32Value

class UInt32Converter : AnyConverter<UInt> {
    override val typeUrl: String = "type.googleapis.com/google.protobuf.UInt32Value"

    override fun convert(any: Any): UInt = UInt32Value.parseFrom(any.value).value.toUInt()
}
