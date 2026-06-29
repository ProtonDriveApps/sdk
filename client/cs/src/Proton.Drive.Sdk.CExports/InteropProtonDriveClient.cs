using System.Text.Json;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk.Caching;
using Proton.Sdk.Configuration;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropProtonDriveClient
{
    public static IMessage HandleCreate(DriveClientCreateRequest request, nint bindingsHandle)
    {
        if (!request.BaseUrl.EndsWith('/'))
        {
            throw new UriFormatException("Base URL must end with a '/'");
        }

        var protonDriveClientOptions = new Sdk.ProtonDriveClientOptions(
            request.ClientOptions.HasUid ? request.ClientOptions.Uid : null,
            request.ClientOptions.HasBindingsLanguage ? request.ClientOptions.BindingsLanguage : null,
            request.ClientOptions.HasApiCallTimeout ? request.ClientOptions.ApiCallTimeout : null,
            request.ClientOptions.HasStorageCallTimeout ? request.ClientOptions.StorageCallTimeout : null,
            request.ClientOptions.HasBlockTransferParallelism ? request.ClientOptions.BlockTransferParallelism : null);

        var httpClientFactory = new InteropHttpClientFactory(
            bindingsHandle,
            request.BaseUrl,
            protonDriveClientOptions.BindingsLanguage,
            new InteropFunction<nint, InteropArray<byte>, nint, nint>(request.HttpClient.RequestFunction),
            new InteropFunction<nint, InteropArray<byte>, nint, nint>(request.HttpClient.ResponseContentReadAction),
            new InteropAction<nint>(request.HttpClient.CancellationAction));

        var accountClient = new InteropProtonAccountClient(bindingsHandle, new InteropAction<nint, InteropArray<byte>, nint>(request.AccountRequestAction));

        ICacheRepository entityCacheRepository = request.HasEntityCachePath
            ? SqliteCacheRepository.OpenFile(request.EntityCachePath)
            : new InMemoryCacheRepository();

        ICacheRepository secretCacheRepository = request.HasSecretCachePath
            ? SqliteCacheRepository.OpenFile(request.SecretCachePath)
            : new InMemoryCacheRepository();

        if (request.HasSecretCacheEncryptionKey)
        {
            secretCacheRepository = new EncryptedCacheRepository(
                secretCacheRepository,
                request.SecretCacheEncryptionKey.ToByteArray());
        }

        ITelemetry telemetry = request.Telemetry.ToTelemetry(bindingsHandle) is { } interopTelemetry
            ? new DriveInteropTelemetryDecorator(interopTelemetry)
            : NullTelemetry.Instance;

        var featureFlagProvider = request.HasFeatureEnabledFunction
            ? new InteropFeatureFlagProvider(bindingsHandle, new InteropFunction<nint, InteropArray<byte>, int>(request.FeatureEnabledFunction))
            : AlwaysDisabledFeatureFlagProvider.Instance;

        var client = new ProtonDriveClient(
            httpClientFactory,
            accountClient,
            entityCacheRepository,
            secretCacheRepository,
            featureFlagProvider,
            telemetry,
            protonDriveClientOptions);

        return new Int64Value
        {
            Value = Interop.AllocHandle(client),
        };
    }

    public static async ValueTask<IMessage> HandleCreateFolderAsync(DriveClientCreateFolderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var createdFolder = await client.CreateFolderAsync(
            NodeUid.Parse(request.ParentFolderUid),
            request.FolderName,
            request.LastModificationTime?.ToDateTimeFixed(),
            cancellationToken).ConfigureAwait(false);

        return createdFolder.ToInterop();
    }

    public static async ValueTask<IMessage> HandleGetFileUploaderAsync(DriveClientGetFileUploaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var additionalMetadata = request.AdditionalMetadata is { Count: > 0 }
            ? request.AdditionalMetadata.Select(x =>
                new Nodes.AdditionalMetadataProperty(x.Name, JsonDocument.Parse(x.Utf8JsonValue.Memory).RootElement))
            : null;

        var metadata = new FileUploadMetadata
        {
            LastModificationTime = request.LastModificationTime?.ToDateTimeFixed(),
            AdditionalMetadata = additionalMetadata,
        };

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        FileUploader? fileUploader;
        if (request is { HasNoWaiting: true, NoWaiting: true })
        {
#pragma warning disable TryTransferQueuing
            fileUploader = client.TryGetFileUploader(
                NodeUid.Parse(request.ParentFolderUid),
                request.Name,
                request.MediaType,
                request.Size,
                metadata,
                request.OverrideExistingDraftByOtherClient);
#pragma warning restore TryTransferQueuing
        }
        else
        {
            fileUploader = await client.GetFileUploaderAsync(
                NodeUid.Parse(request.ParentFolderUid),
                request.Name,
                request.MediaType,
                request.Size,
                metadata,
                request.OverrideExistingDraftByOtherClient,
                cancellationToken).ConfigureAwait(false);
        }

        return new Int64Value { Value = fileUploader is null ? 0 : Interop.AllocHandle(fileUploader) };
    }

    public static async ValueTask<IMessage> HandleGetFileRevisionUploaderAsync(DriveClientGetFileRevisionUploaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var additionalMetadata = request.AdditionalMetadata.Count > 0
            ? request.AdditionalMetadata.Select(x =>
                new Nodes.AdditionalMetadataProperty(x.Name, JsonDocument.Parse(x.Utf8JsonValue.Memory).RootElement))
            : null;

        var metadata = new FileUploadMetadata
        {
            LastModificationTime = request.LastModificationTime?.ToDateTimeFixed(),
            AdditionalMetadata = additionalMetadata,
        };

        FileUploader? fileUploader;
        if (request is { HasNoWaiting: true, NoWaiting: true })
        {
#pragma warning disable TryTransferQueuing
            fileUploader = client.TryGetFileRevisionUploader(
                RevisionUid.Parse(request.CurrentActiveRevisionUid),
                request.Size,
                metadata);
#pragma warning restore TryTransferQueuing
        }
        else
        {
            fileUploader = await client.GetFileRevisionUploaderAsync(
            RevisionUid.Parse(request.CurrentActiveRevisionUid),
            request.Size,
            metadata,
            cancellationToken).ConfigureAwait(false);
        }

        return new Int64Value { Value = fileUploader is null ? 0 : Interop.AllocHandle(fileUploader) };
    }

    public static async ValueTask<IMessage> HandleGetAvailableNameAsync(DriveClientGetAvailableNameRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var availableName = await client.GetAvailableNameAsync(
            NodeUid.Parse(request.ParentFolderUid),
            request.Name,
            cancellationToken).ConfigureAwait(false);

        return new StringValue { Value = availableName };
    }

    public static async ValueTask<IMessage?> HandleEnumerateThumbnailsAsync(DriveClientEnumerateThumbnailsRequest request, nint bindingsHandle)
    {
        var yieldFunction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var thumbnailsEnumerable = client.EnumerateThumbnailsAsync(
            request.FileUids.Select(NodeUid.Parse),
            (Nodes.ThumbnailType)request.Type,
            cancellationToken);

        await foreach (var x in thumbnailsEnumerable.ConfigureAwait(false))
        {
            var thumbnail = new FileThumbnail { FileUid = x.FileUid.ToString() };

            if (x.Result.TryGetValueElseError(out var data, out var error))
            {
                thumbnail.Data = ByteString.CopyFrom(data.Span);
            }
            else
            {
                thumbnail.Error = error.ToInterop();
            }

            yieldFunction.InvokeWithMessage(bindingsHandle, thumbnail);
        }

        return null;
    }

    public static async ValueTask<IMessage?> HandleEnumerateFolderChildrenAsync(DriveClientEnumerateFolderChildrenRequest request, nint bindingsHandle)
    {
        var yieldFunction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        await foreach (var nodeUid in client.EnumerateFolderChildrenNodeUidsAsync(NodeUid.Parse(request.FolderUid), cancellationToken).ConfigureAwait(false))
        {
            yieldFunction.InvokeWithMessage(bindingsHandle, new StringValue { Value = nodeUid.ToString() });
        }

        return null;
    }

    public static async ValueTask<IMessage> HandleGetMyFilesFolderAsync(DriveClientGetMyFilesFolderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var folderNode = await client.GetMyFilesFolderAsync(cancellationToken).ConfigureAwait(false);

        return folderNode.ToInterop();
    }

    public static async ValueTask<IMessage> HandleGetFileDownloaderAsync(DriveClientGetFileDownloaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);
        var revisionUid = RevisionUid.Parse(request.RevisionUid);

        FileDownloader? fileDownloader;
        if (request is { HasNoWaiting: true, NoWaiting: true })
        {
#pragma warning disable TryTransferQueuing
            fileDownloader = client.TryGetFileDownloader(revisionUid);
#pragma warning restore TryTransferQueuing
        }
        else
        {
            fileDownloader = await client.GetFileDownloaderAsync(revisionUid, cancellationToken).ConfigureAwait(false);
        }

        return new Int64Value { Value = fileDownloader is null ? 0 : Interop.AllocHandle(fileDownloader) };
    }

    public static async ValueTask<IMessage?> HandleRenameAsync(DriveClientRenameRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        await client.RenameNodeAsync(
            NodeUid.Parse(request.NodeUid),
            request.NewName,
            request.NewMediaType,
            cancellationToken).ConfigureAwait(false);
        return null;
    }

    public static async ValueTask<IMessage> HandleTrashNodesAsync(DriveClientTrashNodesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var results = await client.TrashNodesAsync(
            request.NodeUids.Select(NodeUid.Parse),
            cancellationToken).ConfigureAwait(false);

        return results.ToInterop();
    }

    public static async ValueTask<IMessage> HandleDeleteNodesAsync(DriveClientDeleteNodesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var results = await client.DeleteNodesAsync(
            request.NodeUids.Select(NodeUid.Parse),
            cancellationToken).ConfigureAwait(false);

        return results.ToInterop();
    }

    public static async ValueTask<IMessage> HandleRestoreNodesAsync(DriveClientRestoreNodesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var results = await client.RestoreNodesAsync(
            request.NodeUids.Select(NodeUid.Parse),
            cancellationToken).ConfigureAwait(false);

        return results.ToInterop();
    }

    public static async ValueTask<IMessage?> HandleEnumerateTrashAsync(DriveClientEnumerateTrashRequest request, nint bindingsHandle)
    {
        var yieldFunction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        await foreach (var nodeUid in client.EnumerateTrashNodeUidsAsync(cancellationToken).ConfigureAwait(false))
        {
            yieldFunction.InvokeWithMessage(bindingsHandle, new StringValue { Value = nodeUid.ToString() });
        }

        return null;
    }

    public static async ValueTask<IMessage?> HandleGetNodeAsync(DriveClientGetNodeRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var node = await client.GetNodeAsync(
            NodeUid.Parse(request.NodeUid),
            cancellationToken).ConfigureAwait(false);

        return node?.ToInterop();
    }

    public static async ValueTask<IMessage?> HandleEmptyTrashAsync(DriveClientEmptyTrashRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        await client.EmptyTrashAsync(cancellationToken).ConfigureAwait(false);

        return null;
    }

    public static async ValueTask<IMessage?> HandleEnumerateDevicesAsync(DriveClientEnumerateDevicesRequest request, nint bindingsHandle)
    {
        var yieldFunction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        await foreach (var device in client.EnumerateDevicesAsync(cancellationToken).ConfigureAwait(false))
        {
            yieldFunction.InvokeWithMessage(bindingsHandle, device.ToInterop());
        }

        return null;
    }

    public static async ValueTask<IMessage> HandleCreateDeviceAsync(DriveClientCreateDeviceRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var device = await client.CreateDeviceAsync(
            request.Name,
            (Devices.DeviceType)(int)request.DeviceType,
            cancellationToken).ConfigureAwait(false);

        return device.ToInterop();
    }

    public static async ValueTask<IMessage> HandleRenameDeviceAsync(DriveClientRenameDeviceRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var device = await client.RenameDeviceAsync(
            Devices.DeviceUid.Parse(request.DeviceUid),
            request.Name,
            cancellationToken).ConfigureAwait(false);

        return device.ToInterop();
    }

    public static async ValueTask<IMessage?> HandleDeleteDeviceAsync(DriveClientDeleteDeviceRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        await client.DeleteDeviceAsync(Devices.DeviceUid.Parse(request.DeviceUid), cancellationToken).ConfigureAwait(false);

        return null;
    }

    public static IMessage? HandleFree(DriveClientFreeRequest request)
    {
        Interop.FreeHandle<ProtonDriveClient>(request.ClientHandle);

        return null;
    }
}
