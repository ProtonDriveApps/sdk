package me.proton.drive.sdk.internal

import me.proton.drive.sdk.ProtonDriveSdkException
import me.proton.drive.sdk.extension.toException
import proton.sdk.ProtonSdk.Response.ResultCase.ERROR
import proton.sdk.ProtonSdk.Response.ResultCase.RESULT_NOT_SET
import proton.sdk.ProtonSdk.Response.ResultCase.VALUE
import java.nio.ByteBuffer
import kotlin.coroutines.Continuation

class ContinuationUnitOrErrorResponse(
    continuation: Continuation<Unit>,
) : BaseContinuationResponse<Unit>(continuation) {
    override fun invoke(data: ByteBuffer) = parse(data) { response ->
        when (response.resultCase) {
            VALUE -> throw ProtonDriveSdkException("No response was expected but: ${response.value.typeUrl}")
            RESULT_NOT_SET -> Unit
            ERROR -> throw response.error.toException()
            null -> throw ProtonDriveSdkException("No response (null)")
        }
    }
}
