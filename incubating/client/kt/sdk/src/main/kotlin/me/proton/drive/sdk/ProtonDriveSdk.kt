package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.core.domain.entity.UserId
import me.proton.core.network.data.ApiProvider
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.internal.AccountClientBridge
import me.proton.drive.sdk.internal.ApiProviderBridge
import me.proton.drive.sdk.internal.InteropProtonDriveClient
import me.proton.drive.sdk.internal.InteropProtonPhotosClient
import me.proton.drive.sdk.internal.JniCancellationTokenSource
import me.proton.drive.sdk.internal.JniLoggerProvider
import me.proton.drive.sdk.internal.JniNativeLibrary
import me.proton.drive.sdk.internal.JniProtonDriveClient
import me.proton.drive.sdk.internal.JniProtonPhotosClient
import me.proton.drive.sdk.internal.ProtonDriveSdkNativeClient
import me.proton.drive.sdk.internal.cancelOnFailure
import me.proton.drive.sdk.internal.clientScope

object ProtonDriveSdk {
    init {
        System.loadLibrary("proton_drive_sdk_jni")
        overrideName()
    }

    suspend fun loggerProvider(logger: SdkLogger): LoggerProvider = JniLoggerProvider(logger).run {
        LoggerProvider(create(), this)
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
        val clientScope = clientScope(coroutineScope)
        val handle = clientScope.cancelOnFailure {
            create(
                coroutineScope = clientScope,
                request = request,
                httpResponseReadPointer = ProtonDriveSdkNativeClient.getHttpResponseReadPointer(),
                onHttpClientRequest = ApiProviderBridge(
                    userId = userId,
                    apiProvider = apiProvider,
                    coroutineScope = clientScope,
                ),
                onAccountRequest = AccountClientBridge(userAddressResolver, publicAddressResolver),
                onRecordMetric = metricCallback?.let(::TelemetryBridge) ?: {},
                onFeatureEnabled = featureEnabled,
            )
        }
        InteropProtonDriveClient(
            handle = handle,
            bridge = this,
            clientScope = clientScope,
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
        val clientScope = clientScope(coroutineScope)
        val handle = clientScope.cancelOnFailure {
            create(
                coroutineScope = clientScope,
                request = request,
                httpResponseReadPointer = ProtonDriveSdkNativeClient.getHttpResponseReadPointer(),
                onHttpClientRequest = ApiProviderBridge(
                    userId = userId,
                    apiProvider = apiProvider,
                    coroutineScope = clientScope,
                ),
                onAccountRequest = AccountClientBridge(userAddressResolver, publicAddressResolver),
                onRecordMetric = metricCallback?.let(::TelemetryBridge) ?: {},
                onFeatureEnabled = featureEnabled,
            )
        }
        InteropProtonPhotosClient(
            handle = handle,
            bridge = this,
            clientScope = clientScope,
        )
    }

    internal suspend fun cancellationTokenSource(): CancellationTokenSource =
        JniCancellationTokenSource().run {
            CancellationTokenSource(create(), this)
        }

    private fun overrideName() {
        // The go variant ships crypto as libgojni.so and redirects the "proton_crypto"
        // lookup to it; the rust variant ships libproton_crypto.so and needs no override.
        val overridingLibraryName = BuildConfig.CRYPTO_LIBRARY_OVERRIDE
        if (overridingLibraryName.isEmpty()) return
        JniNativeLibrary.overrideName(
            libraryName = "proton_crypto".toByteArray(),
            overridingLibraryName = overridingLibraryName.toByteArray()
        )
    }
}
