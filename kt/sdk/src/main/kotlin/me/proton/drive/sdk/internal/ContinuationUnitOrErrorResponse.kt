package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellableContinuation
import proton.sdk.ProtonSdk.Response.ResultCase.ERROR
import proton.sdk.ProtonSdk.Response.ResultCase.RESULT_NOT_SET
import proton.sdk.ProtonSdk.Response.ResultCase.VALUE
import java.nio.ByteBuffer
import kotlin.coroutines.Continuation

class ContinuationUnitOrErrorResponse(
    continuation: CancellableContinuation<Unit>,
) : BaseContinuationResponse<Unit>(continuation) {
    override fun invoke(data: ByteBuffer) = parse(data) { response ->
        when (response.resultCase) {
            VALUE -> error("No response was expected but: ${response.value.typeUrl}")
            RESULT_NOT_SET -> Unit
            ERROR -> error(response.error)
            null -> error("No response (null)")
        }
    }
}
