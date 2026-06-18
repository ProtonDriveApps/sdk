package me.proton.drive.sdk.extension

import com.google.protobuf.MessageLite
import com.google.protobuf.any


fun MessageLite.asAny(name: String) = any {
    typeUrl = "type.googleapis.com/$name"
    value = toByteString()
}
