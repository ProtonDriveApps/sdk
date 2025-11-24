package me.proton.drive.sdk.internal

import java.nio.ByteBuffer

class IgnoredIntegerOrErrorResponse : ResponseCallback {
    override fun invoke(data: ByteBuffer) = Unit
}
