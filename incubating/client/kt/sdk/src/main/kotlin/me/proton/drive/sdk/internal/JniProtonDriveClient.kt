package me.proton.drive.sdk.internal

import com.google.protobuf.Any
import com.google.protobuf.StringValue
import com.google.protobuf.kotlin.toByteString
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.ProducerScope
import me.proton.drive.sdk.converter.DeviceConverter
import me.proton.drive.sdk.converter.NodeConverter
import me.proton.drive.sdk.converter.NodeResultListResponseConverter
import me.proton.drive.sdk.entity.ClientCreateRequest
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.extension.LongResponseCallback
import me.proton.drive.sdk.extension.StringResponseCallback
import me.proton.drive.sdk.extension.UnitResponseCallback
import me.proton.drive.sdk.extension.asCallback
import me.proton.drive.sdk.extension.asNullableCallback
import me.proton.drive.sdk.extension.toFolder
import me.proton.drive.sdk.extension.toLongResponse
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.ProtonDriveSdk.HttpRequest
import proton.drive.sdk.ProtonDriveSdk.HttpResponse
import proton.drive.sdk.ProtonDriveSdk.MetricEvent
import proton.drive.sdk.driveClientCreateRequest
import proton.drive.sdk.driveClientFreeRequest
import proton.drive.sdk.httpClient
import proton.drive.sdk.protonDriveClientOptions
import proton.drive.sdk.request
import proton.drive.sdk.telemetry

class JniProtonDriveClient internal constructor() : JniBaseProtonDriveSdk() {

    suspend fun create(
        coroutineScope: CoroutineScope,
        request: ClientCreateRequest,
        httpResponseReadPointer: Long,
        onHttpClientRequest: suspend (HttpRequest) -> HttpResponse,
        onAccountRequest: suspend (ProtonDriveSdk.AccountRequest) -> Any,
        onRecordMetric: suspend (MetricEvent) -> Unit,
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
                request.secretCacheEncryptionKey?.let { secretCacheEncryptionKey = it.toByteString() }
                clientOptions = protonDriveClientOptions {
                    request.bindingsLanguage?.let { bindingsLanguage = it }
                    request.uid?.let { uid = it }
                    request.apiCallTimeout?.let { apiCallTimeout = it }
                    request.storageCallTimeout?.let { storageCallTimeout = it }
                    request.blockTransferParallelism?.let { blockTransferParallelism = it }
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

    suspend fun enumerateThumbnails(
        coroutineScope: CoroutineScope,
        request: ProtonDriveSdk.DriveClientEnumerateThumbnailsRequest,
        yield: suspend (ProtonDriveSdk.FileThumbnail) -> Unit,
    ): Unit = executeEnumerate(
        name = "enumerateThumbnails",
        callback = UnitResponseCallback,
        yield = yield,
        parser = ProtonDriveSdk.FileThumbnail::parseFrom,
        coroutineScopeProvider = { coroutineScope },
    ) {
        driveClientEnumerateThumbnails = request
    }

    suspend fun createFolder(
        request: ProtonDriveSdk.DriveClientCreateFolderRequest,
    ): ProtonDriveSdk.FolderNode = executeOnce("createFolder", NodeConverter().asCallback) {
        driveClientCreateFolder = request
    }.toFolder()

    suspend fun getMyFilesFolder(
        request: ProtonDriveSdk.DriveClientGetMyFilesFolderRequest,
    ): ProtonDriveSdk.FolderNode = executeOnce("getMyFilesFolder", NodeConverter().asCallback) {
        driveClientGetMyFilesFolder = request
    }.toFolder()

    suspend fun getNode(
        request: ProtonDriveSdk.DriveClientGetNodeRequest,
    ): ProtonDriveSdk.Node? =
        executeOnce("getNode", NodeConverter().asNullableCallback) {
            driveClientGetNode = request
        }

    suspend fun enumerateFolderChildren(
        coroutineScope: CoroutineScope,
        request: ProtonDriveSdk.DriveClientEnumerateFolderChildrenRequest,
        yield: suspend (StringValue) -> Unit,
    ): Unit = executeEnumerate(
        name = "enumerateFolderChildren",
        callback = UnitResponseCallback,
        yield = yield,
        parser = StringValue::parseFrom,
        coroutineScopeProvider = { coroutineScope },
    ) {
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
        coroutineScope: ProducerScope<NodeUid>,
        request: ProtonDriveSdk.DriveClientEnumerateTrashRequest,
        yield: suspend (StringValue) -> Unit,
    ): Unit = executeEnumerate(
        name = "enumerateTrash",
        callback = UnitResponseCallback,
        yield = yield,
        parser = StringValue::parseFrom,
        coroutineScopeProvider = { coroutineScope }
    ) {
        driveClientEnumerateTrash = request
    }

    suspend fun emptyTrash(
        request: ProtonDriveSdk.DriveClientEmptyTrashRequest,
    ): Unit = executeOnce("emptyTrash", UnitResponseCallback) {
        driveClientEmptyTrash = request
    }

    suspend fun enumerateDevices(
        coroutineScope: CoroutineScope,
        request: ProtonDriveSdk.DriveClientEnumerateDevicesRequest,
        yield: suspend (ProtonDriveSdk.Device) -> Unit,
    ): Unit = executeEnumerate(
        name = "enumerateDevices",
        callback = UnitResponseCallback,
        yield = yield,
        parser = ProtonDriveSdk.Device::parseFrom,
        coroutineScopeProvider = { coroutineScope },
    ) {
        driveClientEnumerateDevices = request
    }

    suspend fun createDevice(
        request: ProtonDriveSdk.DriveClientCreateDeviceRequest,
    ): ProtonDriveSdk.Device = executeOnce("createDevice", DeviceConverter().asCallback) {
        driveClientCreateDevice = request
    }

    suspend fun renameDevice(
        request: ProtonDriveSdk.DriveClientRenameDeviceRequest,
    ): ProtonDriveSdk.Device = executeOnce("renameDevice", DeviceConverter().asCallback) {
        driveClientRenameDevice = request
    }

    suspend fun deleteDevice(
        request: ProtonDriveSdk.DriveClientDeleteDeviceRequest,
    ): Unit = executeOnce("deleteDevice", UnitResponseCallback) {
        driveClientDeleteDevice = request
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
