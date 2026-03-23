using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.Http;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk;

public sealed class ProtonPhotosClient
{
    public ProtonPhotosClient(ProtonApiSession session, string? uid = null)
    {
        DriveClient = new ProtonDriveClient(
            session,
            (defaultApiHttpClient, storageApiHttpClient) => new DriveApiClients(defaultApiHttpClient, storageApiHttpClient),
            uid);

        var httpClient = session.GetHttpClient(ProtonDriveDefaults.DriveBaseRoute, TimeSpan.FromSeconds(ProtonApiDefaults.DefaultTimeoutSeconds));

        PhotosApi = new PhotosApiClient(httpClient);
    }

    public ProtonPhotosClient(
        IHttpClientFactory httpClientFactory,
        IAccountClient accountClient,
        ICacheRepository entityCacheRepository,
        ICacheRepository secretCacheRepository,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        ProtonDriveClientOptions? creationParameters = null)
    {
        DriveClient = new ProtonDriveClient(
            httpClientFactory,
            accountClient,
            entityCacheRepository,
            secretCacheRepository,
            featureFlagProvider,
            telemetry,
            (defaultApiHttpClient, storageApiHttpClient) => new DriveApiClients(defaultApiHttpClient, storageApiHttpClient),
            creationParameters);

        var httpClient = new SdkHttpClientFactoryDecorator(httpClientFactory).CreateClientWithTimeout(
            creationParameters?.OverrideDefaultApiTimeoutSeconds ?? ProtonApiDefaults.DefaultTimeoutSeconds);

        PhotosApi = new PhotosApiClient(httpClient);
    }

    internal IPhotosApiClient PhotosApi { get; }

    internal ProtonDriveClient DriveClient { get; }

    public async ValueTask<FileUploader> GetFileUploaderAsync(
        string name,
        string mediaType,
        long size,
        PhotosFileUploadMetadata metadata,
        bool overrideExistingDraftByOtherClient,
        CancellationToken cancellationToken)
    {
        var photosRoot = await PhotosNodeOperations.GetOrCreatePhotosFolderAsync(DriveClient, cancellationToken).ConfigureAwait(false);

        var draftProvider = new NewFileDraftProvider(DriveClient, photosRoot.Uid, name, mediaType, overrideExistingDraftByOtherClient);

        return await GetFileUploaderAsync(draftProvider, photosRoot.Uid, size, metadata, cancellationToken).ConfigureAwait(false);
    }

    public ValueTask<IReadOnlyList<string>> FindDuplicatesAsync(string name, Action<string> generateSha1, CancellationToken cancellationToken)
    {
        _ = DriveClient;
        throw new NotImplementedException();
    }

    public ValueTask<Result<Node, DegradedNode>?> GetNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        return DriveClient.GetNodeAsync(nodeUid, cancellationToken);
    }

    public IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateNodesAsync(IEnumerable<NodeUid> nodeUids, CancellationToken cancellationToken = default)
    {
        return NodeOperations.EnumerateNodesAsync(DriveClient, nodeUids, forPhotos: true, cancellationToken);
    }

    [Experimental("Photos")]
    public IAsyncEnumerable<PhotosTimelineItem> EnumerateTimelineAsync(CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.EnumeratePhotosTimelineAsync(DriveClient, cancellationToken);
    }

    public async ValueTask<PhotosFileDownloader> GetPhotosDownloaderAsync(NodeUid photoUid, CancellationToken cancellationToken)
    {
        return await PhotosFileDownloader.CreateAsync(this, photoUid, cancellationToken).ConfigureAwait(false);
    }

    public IAsyncEnumerable<FileThumbnail> EnumerateThumbnailsAsync(
        IEnumerable<NodeUid> photoUids,
        ThumbnailType thumbnailType = ThumbnailType.Thumbnail,
        CancellationToken cancellationToken = default)
    {
        return FileOperations.EnumerateThumbnailsAsync(DriveClient, photoUids, thumbnailType, forPhotos: true, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> TrashNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.TrashAsync(DriveClient, uids, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> DeleteNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.DeleteFromTrashAsync(DriveClient, uids, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> RestoreNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.RestoreFromTrashAsync(DriveClient, uids, cancellationToken);
    }

    public async IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateTrashAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var volumeId = await VolumeOperations.TryGetPhotosVolumeIdAsync(DriveClient, cancellationToken).ConfigureAwait(false);

        if (volumeId is null)
        {
            // Nothing to enumerate if the main volume doesn't exist
            yield break;
        }

        await foreach (var item in VolumeOperations.EnumerateTrashAsync(DriveClient, volumeId.Value, cancellationToken).ConfigureAwait(false))
        {
            yield return item;
        }
    }

    public async ValueTask EmptyTrashAsync(CancellationToken cancellationToken)
    {
        var volumeId = await VolumeOperations.TryGetPhotosVolumeIdAsync(DriveClient, cancellationToken).ConfigureAwait(false);

        if (volumeId is null)
        {
            // Nothing to do if the photos volume doesn't exist
            return;
        }

        await VolumeOperations.EmptyTrashAsync(DriveClient, volumeId.Value, cancellationToken).ConfigureAwait(false);
    }

    [Experimental("Photos")]
    internal ValueTask<FolderNode> GetPhotosRootAsync(CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.GetOrCreatePhotosFolderAsync(DriveClient, cancellationToken);
    }

    private async ValueTask<FileUploader> GetFileUploaderAsync(
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        PhotosFileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        return await FileUploader.CreateAsync(
            DriveClient,
            revisionDraftProvider,
            telemetryContextNodeUid,
            size,
            metadata,
            cancellationToken).ConfigureAwait(false);
    }
}
