package me.proton.drive.sdk.internal

import java.nio.ByteBuffer

class IgnoredIntegerOrErrorResponse<T> : ClientResponseCallback<T> {
    override fun invoke(client: T, data: ByteBuffer) = Unit
}
