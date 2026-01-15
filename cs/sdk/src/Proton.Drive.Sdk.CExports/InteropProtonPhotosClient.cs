using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes;
using Proton.Photos.Sdk;
using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.CExports;
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
            request.ClientOptions.HasBindingsLanguage ? request.ClientOptions.BindingsLanguage : null,
            request.ClientOptions.HasUid ? request.ClientOptions.Uid : null,
            request.ClientOptions.HasApiCallTimeout ? request.ClientOptions.ApiCallTimeout : null,
            request.ClientOptions.HasStorageCallTimeout ? request.ClientOptions.StorageCallTimeout : null);

        var httpClientFactory = new InteropHttpClientFactory(
            bindingsHandle,
            request.BaseUrl,
            protonDriveClientOptions.BindingsLanguage,
            new InteropFunction<nint, InteropArray<byte>, nint, nint>(request.HttpClient.RequestFunction),
            new InteropAction<nint, InteropArray<byte>, nint>(request.HttpClient.ResponseContentReadAction),
            new InteropAction<nint>(request.HttpClient.CancellationAction));

        var accountClient = new InteropAccountClient(bindingsHandle, new InteropAction<nint, InteropArray<byte>, nint>(request.AccountRequestAction));

        var entityCacheRepository = request.HasEntityCachePath
            ? SqliteCacheRepository.OpenFile(request.EntityCachePath)
            : SqliteCacheRepository.OpenInMemory();

        var secretCacheRepository = request.HasSecretCachePath
            ? SqliteCacheRepository.OpenFile(request.SecretCachePath)
            : SqliteCacheRepository.OpenInMemory();

        ITelemetry telemetry = request.Telemetry.ToTelemetry(bindingsHandle) is { } interopTelemetry
            ? new DriveInteropTelemetryDecorator(interopTelemetry)
            : NullTelemetry.Instance;

        var featureFlagProvider = request.HasFeatureEnabledFunction
            ? new InteropFeatureFlagProvider(bindingsHandle, new InteropFunction<nint, InteropArray<byte>, int>(request.FeatureEnabledFunction))
            : AlwaysDisabledFeatureFlagProvider.Instance;
        
        var client = new ProtonPhotosClient(
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

    public static IMessage HandleCreate(DrivePhotosClientCreateFromSessionRequest request)
    {
        var session = Interop.GetFromHandle<ProtonApiSession>(request.SessionHandle);

        var client = new ProtonPhotosClient(session, request.Uid);

        return new Int64Value { Value = Interop.AllocHandle(client) };
    }

    public static IMessage? HandleFree(DrivePhotosClientFreeRequest request)
    {
        Interop.FreeHandle<ProtonPhotosClient>(request.ClientHandle);

        return null;
    }

    public static async ValueTask<IMessage> HandleGetPhotosRootAsync(DrivePhotosClientGetPhotosRootRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var folderNode = await client.GetPhotosRootAsync(cancellationToken).ConfigureAwait(false);

        return new FolderNode
        {
            Uid = folderNode.Uid.ToString(),
            ParentUid = folderNode.ParentUid.ToString(),
            TreeEventScopeId = folderNode.TreeEventScopeId,
            Name = folderNode.Name,
            CreationTime = folderNode.CreationTime.ToUniversalTime().ToTimestamp(),
            TrashTime = folderNode.TrashTime?.ToUniversalTime().ToTimestamp(),
            NameAuthor = InteropProtonDriveClient.ParseAuthorResult(folderNode.NameAuthor),
            Author = InteropProtonDriveClient.ParseAuthorResult(folderNode.Author),
        };
    }

    public static async ValueTask<IMessage> HandleEnumeratePhotosTimelineAsync(DrivePhotosClientEnumeratePhotosTimelineRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);
        var timelineEnumerable = client.EnumeratePhotosTimelineAsync(
            NodeUid.Parse(request.FolderUid),
            cancellationToken);

        var items = await timelineEnumerable
            .Select(x => new PhotosTimelineItem
            {
                NodeUid = x.Uid.ToString(),
                CaptureTime = x.CaptureTime.ToUniversalTime().ToTimestamp(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new PhotosTimelineList { Items = { items } };
    }

    public static async ValueTask<IMessage> HandleGetPhotosDownloaderAsync(DrivePhotosClientGetPhotoDownloaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var downloader = await client.GetPhotosDownloaderAsync(
            NodeUid.Parse(request.PhotoUid),
            cancellationToken).ConfigureAwait(false);

        return new Int64Value { Value = Interop.AllocHandle(downloader) };
    }

    public static async ValueTask<IMessage> HandleEnumeratePhotosThumbnailsAsync(DrivePhotosClientEnumeratePhotosThumbnailsRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonPhotosClient>(request.ClientHandle);

        var thumbnailsEnumerable = client.EnumeratePhotosThumbnailsAsync(
            request.PhotoUids.Select(NodeUid.Parse),
            (Proton.Drive.Sdk.Nodes.ThumbnailType)request.Type,
            cancellationToken);

        var thumbnails = await thumbnailsEnumerable
            .Select(x => new FileThumbnail
            {
                FileUid = x.FileUid.ToString(),
                Data = ByteString.CopyFrom(x.Data.Span),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new FileThumbnailList { Thumbnails = { thumbnails } };
    }
}
