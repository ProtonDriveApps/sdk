/*
 * Copyright (c) 2024-2025 Proton AG.
 * This file is part of Proton Core.
 *
 * Proton Core is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Core is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Core.  If not, see <https://www.gnu.org/licenses/>.
 */
package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.core.domain.entity.UserId
import me.proton.core.network.data.ApiProvider
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.entity.SessionBeginRequest
import me.proton.drive.sdk.entity.SessionResumeRequest
import me.proton.drive.sdk.internal.AccountClientBridge
import me.proton.drive.sdk.internal.ApiProviderBridge
import me.proton.drive.sdk.internal.JniCancellationTokenSource
import me.proton.drive.sdk.internal.JniDriveClient
import me.proton.drive.sdk.internal.JniLoggerProvider
import me.proton.drive.sdk.internal.JniNativeLibrary
import me.proton.drive.sdk.internal.JniSession

object ProtonDriveSdk {
    init {
        System.loadLibrary("proton_drive_sdk_jni")
        overrideName()
    }

    suspend fun loggerProvider(logger: SdkLogger): LoggerProvider = JniLoggerProvider(logger).run {
        LoggerProvider(create(), this)
    }

    suspend fun sessionBegin(
        request: SessionBeginRequest,
    ): Session = cancellationTokenSource().let { source ->
        JniSession().run {
            Session(begin(source.handle, request), this, source)
        }
    }

    suspend fun sessionResume(
        request: SessionResumeRequest,
    ): Session = cancellationTokenSource().let { source ->
        JniSession().run {
            Session(resume(request), this, source)
        }
    }

    suspend fun driveClientCreate(
        coroutineScope: CoroutineScope,
        userId: UserId,
        apiProvider: ApiProvider,
        request: ClientCreateRequest,
        userAddressResolver: UserAddressResolver,
        publicAddressResolver: PublicAddressResolver,
        metricCallback: MetricCallback? = null,
    ): DriveClient = JniDriveClient().run {
        DriveClient(
            create(
                coroutineScope = coroutineScope,
                request = request,
                onSendHttpRequest = ApiProviderBridge(userId, apiProvider),
                onRequest = AccountClientBridge(userAddressResolver, publicAddressResolver),
                onRecordMetric = metricCallback?.let(::TelemetryBridge) ?: {},
            ), this
        )
    }

    internal suspend fun cancellationTokenSource(): CancellationTokenSource =
        JniCancellationTokenSource().run {
            CancellationTokenSource(create(), this)
        }

    private fun overrideName() {
        JniNativeLibrary().overrideName(
            libraryName = "proton_crypto".toByteArray(),
            overridingLibraryName = "gojni".toByteArray()
        )
    }
}
