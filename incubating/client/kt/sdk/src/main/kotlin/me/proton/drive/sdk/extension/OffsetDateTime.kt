package me.proton.drive.sdk.extension

import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

// The SDK requires seconds and a "Z" or "±hh:mm" offset; ISO_OFFSET_DATE_TIME omits zero seconds
private val iso8601Formatter = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSSSSSSXXX")

internal fun OffsetDateTime.toIso8601String(): String = format(iso8601Formatter)

internal fun String.toOffsetDateTime(): OffsetDateTime = OffsetDateTime.parse(this)
