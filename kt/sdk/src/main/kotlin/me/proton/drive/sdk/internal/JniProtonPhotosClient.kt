package me.proton.drive.sdk.internal

import com.google.protobuf.Any
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.ProducerScope
import me.proton.drive.sdk.converter.NodeResultConverter
import me.proton.drive.sdk.converter.NodeResultListResponseConverter
import me.proton.drive.sdk.converter.PhotosTimelineListConverter
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.entity.NodeResult
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.UnitResponseCallback
import me.proton.drive.sdk.extension.asCallback
import me.proton.drive.sdk.extension.asNullableCallback
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

    suspend fun createFromSession(sessionHandle: Long) =
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
            name = method("create"),
            response = continuation.toLongResponse().asClientResponseCallback(),
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
                request.entityCachePath?.let { entityCachePath = it }
                request.secretCachePath?.let { secretCachePath = it }
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

    suspend fun enumerateThumbnails(
        coroutineScope: CoroutineScope,
        request: ProtonDriveSdk.DrivePhotosClientEnumerateThumbnailsRequest,
        enumerate: suspend (ProtonDriveSdk.FileThumbnail) -> Unit,
    ): Unit = executeEnumerate(
        name = "enumerateThumbnails",
        callback = UnitResponseCallback,
        enumerate = enumerate,
        parser = ProtonDriveSdk.FileThumbnail::parseFrom,
        coroutineScopeProvider = { coroutineScope },
    ) {
        drivePhotosClientEnumerateThumbnails = request
    }

    suspend fun enumerateTimeline(
        request: ProtonDriveSdk.DrivePhotosClientEnumerateTimelineRequest,
    ): ProtonDriveSdk.PhotosTimelineList =
        executeOnce("enumerateTimeline", PhotosTimelineListConverter().asCallback) {
            drivePhotosClientEnumerateTimeline = request
        }

    suspend fun getNode(
        request: ProtonDriveSdk.DrivePhotosClientGetNodeRequest,
    ): ProtonDriveSdk.NodeResult? =
        executeOnce("getNode", NodeResultConverter().asNullableCallback) {
            drivePhotosClientGetNode = request
        }

    suspend fun trashNodes(
        request: ProtonDriveSdk.DrivePhotosClientTrashNodesRequest,
    ): ProtonDriveSdk.NodeResultListResponse =
        executeOnce("trashNodes", NodeResultListResponseConverter().asCallback) {
            drivePhotosClientTrashNodes = request
        }

    suspend fun deleteNodes(
        request: ProtonDriveSdk.DrivePhotosClientDeleteNodesRequest,
    ): ProtonDriveSdk.NodeResultListResponse =
        executeOnce("deleteNodes", NodeResultListResponseConverter().asCallback) {
            drivePhotosClientDeleteNodes = request
        }

    suspend fun restoreNodes(
        request: ProtonDriveSdk.DrivePhotosClientRestoreNodesRequest,
    ): ProtonDriveSdk.NodeResultListResponse =
        executeOnce("restoreNodes", NodeResultListResponseConverter().asCallback) {
            drivePhotosClientRestoreNodes = request
        }

    suspend fun enumerateTrash(
        coroutineScope: ProducerScope<NodeResult>,
        request: ProtonDriveSdk.DrivePhotosClientEnumerateTrashRequest,
        enumerate: suspend (ProtonDriveSdk.NodeResult) -> Unit,
    ): Unit = executeEnumerate(
            name = "enumerateTrash",
            callback = UnitResponseCallback,
            enumerate = enumerate,
            parser = ProtonDriveSdk.NodeResult::parseFrom,
            coroutineScopeProvider = { coroutineScope }
        ) {
            drivePhotosClientEnumerateTrash = request
        }

    suspend fun emptyTrash(
        request: ProtonDriveSdk.DrivePhotosClientEmptyTrashRequest,
    ) = executeOnce("emptyTrash", UnitResponseCallback) {
        drivePhotosClientEmptyTrash = request
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
