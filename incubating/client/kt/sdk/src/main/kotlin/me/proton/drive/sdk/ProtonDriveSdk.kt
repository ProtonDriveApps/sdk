package me.proton.drive.sdk

import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.LoggerProvider.Level.DEBUG
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.internal.AccountClientBridge
import me.proton.drive.sdk.internal.HttpClientBridge
import me.proton.drive.sdk.internal.HttpTransport
import me.proton.drive.sdk.internal.SdkHttpClientTransport
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
    private const val LOG_ID_LENGTH = 8

    init {
        System.loadLibrary("proton_drive_sdk_jni")
        overrideName()
    }

    suspend fun loggerProvider(logger: SdkLogger): LoggerProvider = JniLoggerProvider(logger).run {
        LoggerProvider(create(), this)
    }

    suspend fun protonDriveClientCreate(
        coroutineScope: CoroutineScope,
        host: ClientHost,
        request: ClientCreateRequest,
        metricCallback: MetricCallback? = null,
        featureEnabled: suspend (String) -> Boolean = { false }
    ): ProtonDriveClient =
        createDriveClient(coroutineScope, request, host.wiring(metricCallback, featureEnabled))

    suspend fun protonPhotosClientCreate(
        coroutineScope: CoroutineScope,
        host: ClientHost,
        request: ClientCreateRequest,
        metricCallback: MetricCallback? = null,
        featureEnabled: suspend (String) -> Boolean = { false }
    ): ProtonPhotosClient =
        createPhotosClient(coroutineScope, request, host.wiring(metricCallback, featureEnabled))

    private data class ClientWiring(
        val userId: String,
        val transport: HttpTransport,
        val accountRequest: AccountClientBridge,
        val metricCallback: MetricCallback?,
        val featureEnabled: suspend (String) -> Boolean
    )

    private fun ClientHost.wiring(
        metricCallback: MetricCallback?,
        featureEnabled: suspend (String) -> Boolean
    ): ClientWiring = ClientWiring(
        userId = userId,
        transport = SdkHttpClientTransport(httpClient),
        accountRequest = AccountClientBridge(userAddressResolver, publicAddressResolver),
        metricCallback = metricCallback,
        featureEnabled = featureEnabled
    )

    private suspend fun createDriveClient(
        coroutineScope: CoroutineScope,
        request: ClientCreateRequest,
        wiring: ClientWiring
    ): ProtonDriveClient = JniProtonDriveClient().run {
        clientLogger(DEBUG, "ProtonDriveSdk protonDriveClientCreate(${wiring.userId.take(LOG_ID_LENGTH)})")
        val clientScope = clientScope(coroutineScope)
        val handle = clientScope.cancelOnFailure {
            create(
                coroutineScope = clientScope,
                request = request,
                httpResponseReadPointer = ProtonDriveSdkNativeClient.getHttpResponseReadPointer(),
                onHttpClientRequest = HttpClientBridge(wiring.transport, clientScope),
                onAccountRequest = wiring.accountRequest,
                onRecordMetric = wiring.metricCallback?.let(::TelemetryBridge) ?: {},
                onFeatureEnabled = wiring.featureEnabled
            )
        }
        InteropProtonDriveClient(
            handle = handle,
            bridge = this,
            clientScope = clientScope,
        )
    }

    private suspend fun createPhotosClient(
        coroutineScope: CoroutineScope,
        request: ClientCreateRequest,
        wiring: ClientWiring
    ): ProtonPhotosClient = JniProtonPhotosClient().run {
        clientLogger(DEBUG, "ProtonDriveSdk protonPhotosClientCreate(${wiring.userId.take(LOG_ID_LENGTH)})")
        val clientScope = clientScope(coroutineScope)
        val handle = clientScope.cancelOnFailure {
            create(
                coroutineScope = clientScope,
                request = request,
                httpResponseReadPointer = ProtonDriveSdkNativeClient.getHttpResponseReadPointer(),
                onHttpClientRequest = HttpClientBridge(wiring.transport, clientScope),
                onAccountRequest = wiring.accountRequest,
                onRecordMetric = wiring.metricCallback?.let(::TelemetryBridge) ?: {},
                onFeatureEnabled = wiring.featureEnabled
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
