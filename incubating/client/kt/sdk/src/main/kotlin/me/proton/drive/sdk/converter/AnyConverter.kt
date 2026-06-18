package me.proton.drive.sdk.converter

import com.google.protobuf.Any

interface AnyConverter<T> {
    val typeUrl: String
    fun convert(any: Any): T
}
