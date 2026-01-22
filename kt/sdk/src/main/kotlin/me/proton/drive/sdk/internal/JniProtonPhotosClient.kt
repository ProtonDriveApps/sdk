package me.proton.drive.sdk.internal

import com.google.protobuf.Any
import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.converter.FileThumbnailListConverter
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.asCallback
import me.proton.drive.sdk.extension.toLongResponse
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.drivePhotosClientCreateFromSessionRequest
import proton.drive.sdk.drivePhotosClientCreateRequest
import proton.drive.sdk.drivePhotosClientFreeRequest
import proton.drive.sdk.httpClient
import proton.drive.sdk.protonDriveClientOptions
import proton.drive.sdk.request
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.HttpResponse
import proton.sdk.telemetry

class JniProtonPhotosClient internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun create(sessionHandle: Long) =
        executeOnce("createFromSession", LongResponseCallback) {
            drivePhotosClientCreateFromSession = drivePhotosClientCreateFromSessionRequest {
                this.sessionHandle = sessionHandle
            }
        }

    suspend fun create(
        coroutineScope: CoroutineScope,
        request: ClientCreateRequest,
        httpResponseReadPointer: Long,
        onHttpClientRequest: suspend (ProtonSdk.HttpRequest) -> HttpResponse,
        onAccountRequest: suspend (ProtonDriveSdk.AccountRequest) -> Any,
        onRecordMetric: suspend (ProtonSdk.MetricEvent) -> Unit,
        onFeatureEnabled: suspend (String) -> Boolean,
    ) = executePersistent(clientBuilder = { continuation ->
        ProtonDriveSdkNativeClient(
            method("create"),
            continuation.toLongResponse(),
            httpClientRequest = onHttpClientRequest,
            accountRequest = onAccountRequest,
            logger = internalLogger,
            recordMetric = onRecordMetric,
            featureEnabled = onFeatureEnabled,
            coroutineScopeProvider = { coroutineScope },
        )
    }, requestBuilder = { _ ->
        request {
            drivePhotosClientCreate = drivePhotosClientCreateRequest {
                baseUrl = request.baseUrl
                httpClient = httpClient {
                    requestFunction = ProtonDriveSdkNativeClient.getHttpClientRequestPointer()
                    responseContentReadAction = httpResponseReadPointer
                    cancellationAction = JniJob.getCancelPointer()
                }
                accountRequestAction = ProtonDriveSdkNativeClient.getAccountRequestPointer()
                entityCachePath = request.entityCachePath
                secretCachePath = request.secretCachePath
                telemetry = telemetry {
                    loggerProviderHandle = request.loggerProvider.handle
                    recordMetricAction = ProtonDriveSdkNativeClient.getRecordMetricPointer()
                }
                featureEnabledFunction = ProtonDriveSdkNativeClient.getFeatureEnabledPointer()
                clientOptions = protonDriveClientOptions {
                    request.bindingsLanguage?.let { bindingsLanguage = it }
                    request.uid?.let { uid = it }
                    request.apiCallTimeout?.let { apiCallTimeout = it }
                    request.storageCallTimeout?.let { storageCallTimeout = it }
                }
            }
        }
    })

    suspend fun getThumbnails(
        request: ProtonDriveSdk.DrivePhotosClientEnumeratePhotosThumbnailsRequest,
    ): ProtonDriveSdk.FileThumbnailList =
        executeOnce("getThumbnails", FileThumbnailListConverter().asCallback) {
            drivePhotosClientEnumeratePhotosThumbnails = request
        }

    fun free(handle: Long) {
        dispatch("free") {
            drivePhotosClientFree = drivePhotosClientFreeRequest {
                clientHandle = handle
            }
        }
        releaseAll()
    }
}
