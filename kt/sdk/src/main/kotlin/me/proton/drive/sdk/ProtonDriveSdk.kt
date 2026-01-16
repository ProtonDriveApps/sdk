package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.core.domain.entity.UserId
import me.proton.core.network.data.ApiProvider
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.entity.SessionBeginRequest
import me.proton.drive.sdk.entity.SessionResumeRequest
import me.proton.drive.sdk.internal.AccountClientBridge
import me.proton.drive.sdk.internal.ApiProviderBridge
import me.proton.drive.sdk.internal.JniCancellationTokenSource
import me.proton.drive.sdk.internal.JniProtonDriveClient
import me.proton.drive.sdk.internal.JniProtonPhotosClient
import me.proton.drive.sdk.internal.JniLoggerProvider
import me.proton.drive.sdk.internal.JniNativeLibrary
import me.proton.drive.sdk.internal.JniSession
import me.proton.drive.sdk.internal.ProtonDriveSdkNativeClient

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
            clientLogger(DEBUG, "ProtonDriveSdk sessionBegin")
            Session(begin(source.handle, request), this, source)
        }
    }

    suspend fun sessionResume(
        request: SessionResumeRequest,
    ): Session = cancellationTokenSource().let { source ->
        JniSession().run {
            clientLogger(DEBUG, "ProtonDriveSdk sessionResume")
            Session(resume(request), this, source)
        }
    }

    suspend fun protonDriveClientCreate(
        coroutineScope: CoroutineScope,
        userId: UserId,
        apiProvider: ApiProvider,
        request: ClientCreateRequest,
        userAddressResolver: UserAddressResolver,
        publicAddressResolver: PublicAddressResolver,
        metricCallback: MetricCallback? = null,
        featureEnabled: suspend (String) -> Boolean = { false },
    ): ProtonDriveClient = JniProtonDriveClient().run {
        clientLogger(DEBUG, "ProtonDriveSdk protonDriveClientCreate(${userId.id.take(8)})")
        ProtonDriveClient(
            create(
                coroutineScope = coroutineScope,
                request = request,
                httpResponseReadPointer = ProtonDriveSdkNativeClient.getHttpResponseReadPointer(),
                onHttpClientRequest = ApiProviderBridge(
                    userId = userId,
                    apiProvider = apiProvider,
                    coroutineScope = coroutineScope,
                ),
                onAccountRequest = AccountClientBridge(userAddressResolver, publicAddressResolver),
                onRecordMetric = metricCallback?.let(::TelemetryBridge) ?: {},
                onFeatureEnabled = featureEnabled
            ), this
        )
    }

    suspend fun protonPhotosClientCreate(
        coroutineScope: CoroutineScope,
        userId: UserId,
        apiProvider: ApiProvider,
        request: ClientCreateRequest,
        userAddressResolver: UserAddressResolver,
        publicAddressResolver: PublicAddressResolver,
        metricCallback: MetricCallback? = null,
        featureEnabled: suspend (String) -> Boolean = { false },
    ): ProtonPhotosClient = JniProtonPhotosClient().run {
        clientLogger(DEBUG, "ProtonDriveSdk protonPhotosClientCreate(${userId.id.take(8)})")
        ProtonPhotosClient(
            create(
                coroutineScope = coroutineScope,
                request = request,
                httpResponseReadPointer = ProtonDriveSdkNativeClient.getHttpResponseReadPointer(),
                onHttpClientRequest = ApiProviderBridge(
                    userId = userId,
                    apiProvider = apiProvider,
                    coroutineScope = coroutineScope,
                ),
                onAccountRequest = AccountClientBridge(userAddressResolver, publicAddressResolver),
                onRecordMetric = metricCallback?.let(::TelemetryBridge) ?: {},
                onFeatureEnabled = featureEnabled
            ), this
        )
    }

    internal suspend fun cancellationTokenSource(): CancellationTokenSource =
        JniCancellationTokenSource().run {
            CancellationTokenSource(create(), this)
        }

    private fun overrideName() {
        JniNativeLibrary.overrideName(
            libraryName = "proton_crypto".toByteArray(),
            overridingLibraryName = "gojni".toByteArray()
        )
    }
}
