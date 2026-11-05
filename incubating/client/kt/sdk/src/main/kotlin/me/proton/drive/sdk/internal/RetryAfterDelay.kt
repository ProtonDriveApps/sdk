package me.proton.drive.sdk.internal

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import me.proton.drive.sdk.extension.coerceInOrElse
import kotlin.math.pow
import kotlin.random.Random
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

internal object RetryAfterDelay {
    private const val MAX_FAILURES = 10
    private val MAX_DELAY_DURATION = 60.seconds
    private val MAX_RETRY_AFTER_DURATION = 60.seconds
    private val DEFAULT_SERVER_ERROR_DURATION = 1.seconds

    suspend fun execute(
        isEnabled: Boolean,
        strategy: Duration.(Int, Double) -> Duration = Duration::exponentialDelay,
        block: suspend (Int) -> HttpResult
    ): HttpResult {
        var attempt = 0
        var remaining = MAX_DELAY_DURATION
        var result: HttpResult
        var retrying: Boolean
        do {
            result = block(attempt)
            if (!isEnabled) break
            attempt++
            val duration = when (result.statusCode) {
                429 -> result.retryAfter.coerceInOrElse(
                    minValue = Duration.ZERO,
                    maxValue = MAX_RETRY_AFTER_DURATION
                )
                in 500..599 ->
                    DEFAULT_SERVER_ERROR_DURATION
                        .strategy(attempt, 2.0)
                        .coerceAtMost(remaining)
                else -> break
            }
            remaining -= duration
            try {
                delay(duration)
            } catch (cancellation: CancellationException) {
                // Nobody will read the response that was waiting for a retry.
                (result as? HttpResult.Success)?.response?.body?.close()
                throw cancellation
            }
            retrying = remaining.isPositive() && attempt < MAX_FAILURES
            if (retrying) (result as? HttpResult.Success)?.response?.body?.close()
        } while (retrying)
        return result
    }
}

internal fun Duration.exponentialDelay(retryCount: Int, base: Double = 2.0): Duration {
    fun jitter(duration: Double, fraction: Double = 0.2) = duration * (1 + fraction * Random.nextDouble())
    return this * jitter(base.pow(retryCount))
}
