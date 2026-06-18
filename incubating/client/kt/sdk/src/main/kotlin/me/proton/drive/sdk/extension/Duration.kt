package me.proton.drive.sdk.extension

import kotlin.ranges.coerceIn
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.DurationUnit
import kotlin.time.toDuration

fun Duration?.coerceInOrElse(
    minValue: Duration,
    maxValue: Duration,
    defaultValue: Duration = 10.seconds,
) = this?.inWholeNanoseconds?.coerceIn(
    minValue.inWholeNanoseconds,
    maxValue.inWholeNanoseconds,
)?.toDuration(DurationUnit.NANOSECONDS) ?: defaultValue
