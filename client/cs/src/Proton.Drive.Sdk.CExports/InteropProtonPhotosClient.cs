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

internal static class InteropProtonPhotosClient
{
    public static IMessage HandleCreate(DrivePhotosClientCreateRequest request, nint bindingsHandle)
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

        ICacheRepository? cacheRepository = request.HasCachePath
            ? SqliteCacheRepository.OpenFile(request.CachePath)
            : null;

        if (request.HasCacheEncryptionKey && cacheRepository is not null)
        {
            cacheRepository = new EncryptedCacheRepository(cacheRepository, request.CacheEncryptionKey.ToByteArray());
        }

        ITelemetry telemetry = request.Telemetry.ToTelemetry(bindingsHandle) is { } interopTelemetry
            ? new DriveInteropTelemetryDecorator(interopTelemetry)
            : NullTelemetry.Instance;

        var featureFlagProvider = request.HasFeatureEnabledFunction
            ? new InteropFeatureFlagProvider(bindingsHandle, new InteropFunction<nint, InteropArray<byte>, int>(request.FeatureEnabledFunction))
            : AlwaysDisabledFeatureFlagProvider.Instance;

        var client = new ProtonPhotosClient(
            httpClientFactory,
            accountClient,
            cacheRepository,
            featureFlagProvider,
            telemetry,
            protonDriveClientOptions);

        return new Int64Value
        {
            Value = Interop.AllocHandle(client),
        };
    }

    public static async ValueTask<IMessage> HandleUpdatePhotosAsync(DrivePhotosClientUpdatePhotosRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var updates = request.Updates.Select(update => new Nodes.PhotoTagsUpdate
        {
            NodeUid = NodeUid.Parse(update.NodeUid),
            TagsToAdd = update.TagsToAdd.Select(tag => (Nodes.PhotoTag)tag).ToList(),
            TagsToRemove = update.TagsToRemove.Select(tag => (Nodes.PhotoTag)tag).ToList(),
        }).ToList();

        var results = await client.UpdatePhotosAsync(updates, cancellationToken).ConfigureAwait(false);

        return results.ToInterop();
    }

    public static async ValueTask<IMessage> HandleTrashNodesAsync(DrivePhotosClientTrashNodesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var results = await client.TrashNodesAsync(
            request.NodeUids.Select(NodeUid.Parse),
            cancellationToken).ConfigureAwait(false);

        return results.ToInterop();
    }

    public static async ValueTask<IMessage> HandleDeleteNodesAsync(DrivePhotosClientDeleteNodesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var results = await client.DeleteNodesAsync(
            request.NodeUids.Select(NodeUid.Parse),
            cancellationToken).ConfigureAwait(false);

        return results.ToInterop();
    }

    public static async ValueTask<IMessage> HandleRestoreNodesAsync(DrivePhotosClientRestoreNodesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var results = await client.RestoreNodesAsync(
            request.NodeUids.Select(NodeUid.Parse),
            cancellationToken).ConfigureAwait(false);

        return results.ToInterop();
    }

    public static async ValueTask<IMessage?> HandleEnumerateTrashAsync(DrivePhotosClientEnumerateTrashRequest request, nint bindingsHandle)
    {
        var yieldAction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        await foreach (var nodeUid in client.EnumerateTrashNodeUidsAsync(cancellationToken).ConfigureAwait(false))
        {
            yieldAction.InvokeWithMessage(bindingsHandle, new StringValue { Value = nodeUid.ToString() });
        }

        return null;
    }

    public static async ValueTask<IMessage?> HandleEmptyTrashAsync(DrivePhotosClientEmptyTrashRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        await client.EmptyTrashAsync(cancellationToken).ConfigureAwait(false);

        return null;
    }

    public static async ValueTask<IMessage?> HandleLeaveSharedNodeAsync(DrivePhotosClientLeaveSharedNodeRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        await client.LeaveSharedNodeAsync(NodeUid.Parse(request.NodeUid), cancellationToken).ConfigureAwait(false);

        return null;
    }

    public static async ValueTask<IMessage?> HandleEnumerateSharedNodeUidsAsync(
        DrivePhotosClientEnumerateSharedNodeUidsRequest request,
        nint bindingsHandle)
    {
        var yieldAction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        await foreach (var nodeUid in client.EnumerateSharedNodeUidsAsync(cancellationToken).ConfigureAwait(false))
        {
            yieldAction.InvokeWithMessage(bindingsHandle, new StringValue { Value = nodeUid.ToString() });
        }

        return null;
    }

    public static IMessage? HandleFree(DrivePhotosClientFreeRequest request)
    {
        Interop.FreeHandle<ProtonPhotosClient>(request.ClientHandle);

        return null;
    }

    public static async ValueTask<IMessage?> HandleGetNodeAsync(DrivePhotosClientGetNodeRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var node = await client.GetNodeAsync(NodeUid.Parse(request.NodeUid), cancellationToken).ConfigureAwait(false);

        return node?.ToInterop();
    }

    public static async ValueTask<IMessage?> HandleEnumeratePhotosTimelineAsync(DrivePhotosClientEnumerateTimelineRequest request, nint bindingsHandle)
    {
        var yieldAction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        await foreach (var x in client.EnumerateTimelineAsync(cancellationToken).ConfigureAwait(false))
        {
            yieldAction.InvokeWithMessage(bindingsHandle, new PhotosTimelineItem
            {
                NodeUid = x.Uid.ToString(),
                CaptureTime = x.CaptureTime.ToUniversalTime().ToTimestamp(),
            });
        }

        return null;
    }

    public static async ValueTask<IMessage?> HandleEnumerateAlbumNodeUidsAsync(DrivePhotosClientEnumerateAlbumNodeUidsRequest request, nint bindingsHandle)
    {
        var yieldAction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        await foreach (var nodeUid in client.EnumerateAlbumNodeUidsAsync(cancellationToken).ConfigureAwait(false))
        {
            yieldAction.InvokeWithMessage(bindingsHandle, new StringValue { Value = nodeUid.ToString() });
        }

        return null;
    }

    public static async ValueTask<IMessage?> HandleEnumerateAlbumAsync(DrivePhotosClientEnumerateAlbumRequest request, nint bindingsHandle)
    {
        var yieldAction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var albumUid = NodeUid.Parse(request.AlbumUid);

        await foreach (var x in client.EnumerateAlbumAsync(albumUid, cancellationToken).ConfigureAwait(false))
        {
            yieldAction.InvokeWithMessage(bindingsHandle, new AlbumItem
            {
                NodeUid = x.Uid.ToString(),
                CaptureTime = x.CaptureTime.ToUniversalTime().ToTimestamp(),
            });
        }

        return null;
    }

    public static async ValueTask<IMessage> HandleGetPhotosDownloaderAsync(DrivePhotosClientGetPhotoDownloaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var photoUid = NodeUid.Parse(request.PhotoUid);

        PhotosFileDownloader? downloader;
        if (request is { HasNoWaiting: true, NoWaiting: true })
        {
#pragma warning disable TryTransferQueuing
            downloader = client.TryGetPhotosDownloader(photoUid);
#pragma warning restore TryTransferQueuing
        }
        else
        {
            downloader = await client.GetPhotosDownloaderAsync(photoUid, cancellationToken).ConfigureAwait(false);
        }

        return new Int64Value { Value = downloader is null ? 0 : Interop.AllocHandle(downloader) };
    }

    public static async ValueTask<IMessage?> HandleEnumerateThumbnailsAsync(DrivePhotosClientEnumerateThumbnailsRequest request, nint bindingsHandle)
    {
        var yieldAction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var thumbnailsEnumerable = client.EnumerateThumbnailsAsync(
            request.PhotoUids.Select(NodeUid.Parse),
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

            yieldAction.InvokeWithMessage(bindingsHandle, thumbnail);
        }

        return null;
    }

    public static async ValueTask<IMessage> HandleGetFileUploaderAsync(DrivePhotosClientGetPhotoUploaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var tags = request.Metadata.Tags is { Count: > 0 }
            ? request.Metadata.Tags.Select(t => (Nodes.PhotoTag)t)
            : null;

        var additionalMetadata = request.Metadata.AdditionalMetadata is { Count: > 0 }
            ? request.Metadata.AdditionalMetadata.Select(x =>
                new Nodes.AdditionalMetadataProperty(x.Name, JsonDocument.Parse(x.Utf8JsonValue.Memory).RootElement))
            : null;

        var metadata = new Nodes.PhotosFileUploadMetadata
        {
            AdditionalMetadata = additionalMetadata,
            LastModificationTime = request.Metadata.LastModificationTime?.ToDateTimeFixed(),
            CaptureTime = request.Metadata.CaptureTime?.ToDateTimeFixed(),
            MainPhotoUid = request.Metadata.HasMainPhotoUid ? NodeUid.Parse(request.Metadata.MainPhotoUid) : null,
            Tags = tags,
        };

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        FileUploader? uploader;
        if (request is { HasNoWaiting: true, NoWaiting: true })
        {
#pragma warning disable TryTransferQueuing
            uploader = await client.TryGetFileUploaderAsync(
                request.Name,
                request.MediaType,
                request.Size,
                metadata,
                request.OverrideExistingDraftByOtherClient,
                cancellationToken).ConfigureAwait(false);
#pragma warning restore TryTransferQueuing
        }
        else
        {
            uploader = await client.GetFileUploaderAsync(
                request.Name,
                request.MediaType,
                request.Size,
                metadata,
                request.OverrideExistingDraftByOtherClient,
                cancellationToken).ConfigureAwait(false);
        }

        return new Int64Value { Value = uploader is null ? 0 : Interop.AllocHandle(uploader) };
    }

    public static async ValueTask<IMessage> HandleFindDuplicatesAsync(DrivePhotosClientFindDuplicatesRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var sha1Provider = InteropFileUploader.CreateSha1Provider(bindingsHandle, request.GenerateSha1Function);

        var duplicates = await client.FindDuplicatesAsync(
            request.Name,
            _ => ValueTask.FromResult(sha1Provider()),
            cancellationToken).ConfigureAwait(false);

        var result = new ListValue();
        result.Values.AddRange(duplicates.Select(Value.ForString));

        return result;
    }
}
