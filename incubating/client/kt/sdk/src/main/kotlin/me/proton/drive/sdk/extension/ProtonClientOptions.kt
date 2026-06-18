package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.ProtonClientOptions
import proton.sdk.protonClientOptions
import proton.sdk.telemetry

internal fun ProtonClientOptions.toProtobuf(
    recordMetricAction: Long? = null,
) = protonClientOptions {
    this@toProtobuf.userAgent?.let { userAgent = it }
    this@toProtobuf.baseUrl?.let { baseUrl = it }
    this@toProtobuf.bindingsLanguage?.let { bindingsLanguage = it }
    this@toProtobuf.tlsPolicy?.let { tlsPolicy = it.toProtobuf() }
    telemetry = telemetry {
        this@toProtobuf.loggerProvider?.let { loggerProviderHandle = it.handle }
        recordMetricAction?.let { this@telemetry.recordMetricAction = recordMetricAction }
    }
    this@toProtobuf.entityCachePath?.let { entityCachePath = it }
}
