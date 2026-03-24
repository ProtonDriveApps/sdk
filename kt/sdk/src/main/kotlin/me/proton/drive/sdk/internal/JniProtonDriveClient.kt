package me.proton.drive.sdk.internal

import com.google.protobuf.Any
import kotlinx.coroutines.CoroutineScope
import me.proton.drive.sdk.converter.NodeResultListResponseConverter
import me.proton.drive.sdk.converter.FileThumbnailListConverter
import me.proton.drive.sdk.converter.FolderChildrenListConverter
import me.proton.drive.sdk.converter.FolderNodeConverter
import me.proton.drive.sdk.converter.TrashChildrenListConverter
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.StringResponseCallback
import me.proton.drive.sdk.extension.UnitResponseCallback
import me.proton.drive.sdk.extension.asCallback
import me.proton.drive.sdk.extension.toLongResponse
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.driveClientCreateFromSessionRequest
import proton.drive.sdk.driveClientCreateRequest
import proton.drive.sdk.driveClientFreeRequest
import proton.drive.sdk.httpClient
import proton.drive.sdk.protonDriveClientOptions
import proton.drive.sdk.request
import proton.sdk.ProtonSdk
import proton.sdk.ProtonSdk.HttpResponse
import proton.sdk.telemetry


class JniProtonDriveClient internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun createFromSession(
        sessionHandle: Long,
        uid: String? = null,
        blockTransferDegreeOfParallelism: Int? = null,
    ) =
        executeOnce("createFromSession", LongResponseCallback) {
            driveClientCreateFromSession = driveClientCreateFromSessionRequest {
                this.sessionHandle = sessionHandle
                uid?.let { this.uid = it }
                blockTransferDegreeOfParallelism?.let { this.blockTransferDegreeOfParallelism = it }
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
                    request.blockTransferDegreeOfParallelism?.let { blockTransferDegreeOfParallelism = it }
                }
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
        executeOnce("getThumbnails", FileThumbnailListConverter().asCallback) {
            driveClientGetThumbnails = request
        }

    suspend fun enumerateThumbnails(
        coroutineScope: CoroutineScope,
        request: ProtonDriveSdk.DriveClientEnumerateThumbnailsRequest,
        enumerate: suspend (ProtonDriveSdk.FileThumbnail) -> Unit,
    ): Unit = executeEnumerate(
        name = "enumerateThumbnails",
        callback = UnitResponseCallback,
        enumerate = enumerate,
        parser = ProtonDriveSdk.FileThumbnail::parseFrom,
        coroutineScopeProvider = { coroutineScope },
    ) {
        driveClientEnumerateThumbnails = request
    }

    suspend fun createFolder(
        request: ProtonDriveSdk.DriveClientCreateFolderRequest,
    ): ProtonDriveSdk.FolderNode = executeOnce("createFolder", FolderNodeConverter().asCallback) {
        driveClientCreateFolder = request
    }

    suspend fun getMyFilesFolder(
        request: ProtonDriveSdk.DriveClientGetMyFilesFolderRequest,
    ): ProtonDriveSdk.FolderNode = executeOnce("getMyFilesFolder", FolderNodeConverter().asCallback) {
        driveClientGetMyFilesFolder = request
    }

    suspend fun enumerateFolderChildren(
        request: ProtonDriveSdk.DriveClientEnumerateFolderChildrenRequest,
    ): ProtonDriveSdk.FolderChildrenList =
        executeOnce("enumerateFolderChildren", FolderChildrenListConverter().asCallback) {
            driveClientEnumerateFolderChildren = request
        }

    suspend fun trashNodes(
        request: ProtonDriveSdk.DriveClientTrashNodesRequest,
    ): ProtonDriveSdk.NodeResultListResponse =
        executeOnce("trashNodes", NodeResultListResponseConverter().asCallback) {
            driveClientTrashNodes = request
        }

    suspend fun deleteNodes(
        request: ProtonDriveSdk.DriveClientDeleteNodesRequest,
    ): ProtonDriveSdk.NodeResultListResponse =
        executeOnce("deleteNodes", NodeResultListResponseConverter().asCallback) {
            driveClientDeleteNodes = request
        }

    suspend fun restoreNodes(
        request: ProtonDriveSdk.DriveClientRestoreNodesRequest,
    ): ProtonDriveSdk.NodeResultListResponse =
        executeOnce("restoreNodes", NodeResultListResponseConverter().asCallback) {
            driveClientRestoreNodes = request
        }

    suspend fun enumerateTrash(
        request: ProtonDriveSdk.DriveClientEnumerateTrashRequest,
    ): ProtonDriveSdk.TrashChildrenList =
        executeOnce("enumerateTrash", TrashChildrenListConverter().asCallback) {
            driveClientEnumerateTrash = request
        }

    suspend fun emptyTrash(
        request: ProtonDriveSdk.DriveClientEmptyTrashRequest,
    ): Unit = executeOnce("emptyTrash", UnitResponseCallback) {
        driveClientEmptyTrash = request
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
