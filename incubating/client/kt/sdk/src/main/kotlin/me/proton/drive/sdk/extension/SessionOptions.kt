package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.ProtonClientOptions
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.NO_CERTIFICATE_PINNING
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.NO_CERTIFICATE_VALIDATION
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.STRICT
import proton.drive.sdk.account.ProtonDriveSdkAccount.SessionTlsPolicy.SESSION_TLS_POLICY_NO_CERTIFICATE_PINNING
import proton.drive.sdk.account.ProtonDriveSdkAccount.SessionTlsPolicy.SESSION_TLS_POLICY_NO_CERTIFICATE_VALIDATION
import proton.drive.sdk.account.ProtonDriveSdkAccount.SessionTlsPolicy.SESSION_TLS_POLICY_STRICT
import proton.drive.sdk.account.sessionOptions
import proton.drive.sdk.account.sessionTelemetry

internal fun ProtonClientOptions.toSessionOptionsProtobuf(
    recordMetricAction: Long? = null,
) = sessionOptions {
    this@toSessionOptionsProtobuf.userAgent?.let { userAgent = it }
    this@toSessionOptionsProtobuf.baseUrl?.let { baseUrl = it }
    this@toSessionOptionsProtobuf.bindingsLanguage?.let { bindingsLanguage = it }
    this@toSessionOptionsProtobuf.tlsPolicy?.let { tlsPolicy = it.toSessionTlsPolicy() }
    telemetry = sessionTelemetry {
        this@toSessionOptionsProtobuf.loggerProvider?.let { loggerProviderHandle = it.handle }
        recordMetricAction?.let { this@sessionTelemetry.recordMetricAction = recordMetricAction }
    }
    this@toSessionOptionsProtobuf.entityCachePath?.let { entityCachePath = it }
}

private fun ProtonClientTlsPolicy.toSessionTlsPolicy() = when (this) {
    STRICT -> SESSION_TLS_POLICY_STRICT
    NO_CERTIFICATE_PINNING -> SESSION_TLS_POLICY_NO_CERTIFICATE_PINNING
    NO_CERTIFICATE_VALIDATION -> SESSION_TLS_POLICY_NO_CERTIFICATE_VALIDATION
}
