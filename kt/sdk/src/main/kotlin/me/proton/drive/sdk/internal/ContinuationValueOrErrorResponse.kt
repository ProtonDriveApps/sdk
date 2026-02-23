package me.proton.drive.sdk.internal

import me.proton.drive.sdk.converter.AnyConverter
import proton.sdk.ProtonSdk.Response.ResultCase.ERROR
import proton.sdk.ProtonSdk.Response.ResultCase.RESULT_NOT_SET
import proton.sdk.ProtonSdk.Response.ResultCase.VALUE
import java.nio.ByteBuffer
import kotlin.coroutines.Continuation

class ContinuationValueOrErrorResponse<T>(
    continuation: Continuation<T>,
    private val anyConverter: AnyConverter<T>,
) : BaseContinuationResponse<T>(continuation) {

    override fun invoke(data: ByteBuffer) = parse(data) { response ->
        when (response.resultCase) {
            VALUE -> {
                if (response.value.typeUrl == anyConverter.typeUrl) {
                    error("Wrong converter for ${response.value.typeUrl} (${anyConverter.typeUrl})")
                }
                anyConverter.convert(response.value)
            }

            RESULT_NOT_SET -> error("No response (not set)")
            ERROR -> error(response.error)
            null -> error("No response (null)")
        }
    }
}
