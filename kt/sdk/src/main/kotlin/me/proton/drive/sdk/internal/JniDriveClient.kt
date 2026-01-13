package me.proton.drive.sdk.internal

import com.google.protobuf.Any
import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.extension.FileThumbnailListResponseCallback
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.StringResponseCallback
import me.proton.drive.sdk.extension.UnitResponseCallback
import me.proton.drive.sdk.extension.toLongResponse
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.driveClientCreateFromSessionRequest
import proton.drive.sdk.driveClientCreateRequest
import proton.drive.sdk.driveClientFreeRequest
import proton.drive.sdk.httpClient
import proton.drive.sdk.request
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.HttpResponse
import proton.sdk.telemetry


class JniDriveClient internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun create(sessionHandle: Long) =
        executeOnce("createFromSession", LongResponseCallback) {
            driveClientCreateFromSession = driveClientCreateFromSessionRequest {
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
            coroutineScope = coroutineScope,
        )
    }, requestBuilder = { client ->
        request {
            driveClientCreate = driveClientCreateRequest {
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
                request.bindingsLanguage?.let { bindingsLanguage = it }
                request.uid?.let { uid = it }
            }
        }
    })

    suspend fun getAvailableName(
        request: ProtonDriveSdk.DriveClientGetAvailableNameRequest,
    ): String = executeOnce("getAvailableName", StringResponseCallback) {
        driveClientGetAvailableName = request
    }

    suspend fun rename(
        request: ProtonDriveSdk.DriveClientRenameRequest,
    ): Unit = executeOnce("rename", UnitResponseCallback) {
        driveClientRename = request
    }

    suspend fun getThumbnails(
        request: ProtonDriveSdk.DriveClientGetThumbnailsRequest,
    ): ProtonDriveSdk.FileThumbnailList =
        executeOnce("getThumbnails", FileThumbnailListResponseCallback) {
            driveClientGetThumbnails = request
        }

    fun free(handle: Long) {
        dispatch("free") {
            driveClientFree = driveClientFreeRequest {
                clientHandle = handle
            }
        }
        releaseAll()
    }
}
