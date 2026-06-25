package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.ProtonClientTlsPolicy
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.NO_CERTIFICATE_PINNING
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.NO_CERTIFICATE_VALIDATION
import me.proton.drive.sdk.entity.ProtonClientTlsPolicy.STRICT
import proton.sdk.ProtonSdkCommon
import proton.sdk.ProtonSdkCommon.ProtonClientTlsPolicy.PROTON_CLIENT_TLS_POLICY_NO_CERTIFICATE_PINNING
import proton.sdk.ProtonSdkCommon.ProtonClientTlsPolicy.PROTON_CLIENT_TLS_POLICY_NO_CERTIFICATE_VALIDATION
import proton.sdk.ProtonSdkCommon.ProtonClientTlsPolicy.PROTON_CLIENT_TLS_POLICY_STRICT

fun ProtonClientTlsPolicy.toProtobuf(): ProtonSdkCommon.ProtonClientTlsPolicy = when (this) {
    STRICT -> PROTON_CLIENT_TLS_POLICY_STRICT
    NO_CERTIFICATE_PINNING -> PROTON_CLIENT_TLS_POLICY_NO_CERTIFICATE_PINNING
    NO_CERTIFICATE_VALIDATION -> PROTON_CLIENT_TLS_POLICY_NO_CERTIFICATE_VALIDATION
}
