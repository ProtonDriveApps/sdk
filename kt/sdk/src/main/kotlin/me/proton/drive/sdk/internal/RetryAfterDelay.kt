package me.proton.drive.sdk.internal

import kotlinx.coroutines.delay
import me.proton.core.network.domain.ApiResult
import me.proton.drive.sdk.extension.coerceInOrElse
import okhttp3.ResponseBody
import retrofit2.Response
import kotlin.math.pow
import kotlin.random.Random
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

object RetryAfterDelay {
    private const val MAX_FAILURES = 10
    private val MAX_DELAY_DURATION = 60.seconds
    private val MAX_RETRY_AFTER_DURATION = 60.seconds
    private val DEFAULT_SERVER_ERROR_DURATION = 1.seconds

    suspend operator fun invoke(
        isEnabled: Boolean,
        strategy: Duration.(Int, Double) -> Duration = Duration::exponentialDelay,
        block: suspend () -> ApiResult<Response<ResponseBody>>,
    ): ApiResult<Response<ResponseBody>> {
        var attempts = 0
        var remaining = MAX_DELAY_DURATION
        var result: ApiResult<Response<ResponseBody>>
        do {
            result = block()
            if (!isEnabled) break
            attempts++
            val duration = when (result) {
                is ApiResult.Error.Http -> {
                    when (result.httpCode) {
                        429 -> result.retryAfter.coerceInOrElse(
                            minValue = Duration.ZERO,
                            maxValue = MAX_RETRY_AFTER_DURATION,
                        )
                        in 500..599 -> DEFAULT_SERVER_ERROR_DURATION
                            .strategy(attempts, 2.0)
                            .coerceAtMost(remaining)
                        else -> break
                    }
                }
                else -> break
            }
            remaining -= duration
            delay(duration)
        } while (remaining.isPositive() && attempts < MAX_FAILURES)
        return result
    }
}

fun Duration.exponentialDelay(retryCount: Int, base: Double = 2.0): Duration {
    fun jitter(duration: Double, fraction: Double = 0.2) = duration * (1 + fraction * Random.nextDouble())
    return this * jitter(base.pow(retryCount))
}
