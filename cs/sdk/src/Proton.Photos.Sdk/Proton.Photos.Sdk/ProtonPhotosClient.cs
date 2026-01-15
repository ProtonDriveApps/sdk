using System.Diagnostics.CodeAnalysis;
using Proton.Drive.Sdk;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes;
using Proton.Photos.Sdk.Api;
using Proton.Photos.Sdk.Caching;
using Proton.Photos.Sdk.Nodes;
using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.Http;
using Proton.Sdk.Telemetry;

namespace Proton.Photos.Sdk;

public sealed class ProtonPhotosClient : IDisposable
{
    private readonly HttpClient _httpClient;

    public ProtonPhotosClient(ProtonApiSession session, string? uid = null)
    {
        DriveClient = new ProtonDriveClient(session, uid);

        _httpClient = session.GetHttpClient(ProtonDriveDefaults.DriveBaseRoute, TimeSpan.FromSeconds(ProtonDriveDefaults.DefaultApiTimeoutSeconds));

        Cache = new PhotosClientCache(session.ClientConfiguration.EntityCacheRepository, session.ClientConfiguration.SecretCacheRepository);
        PhotosApi = new PhotosApiClient(_httpClient);
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
            creationParameters);

        _httpClient = new SdkHttpClientFactoryDecorator(httpClientFactory).CreateClientWithTimeout(creationParameters?.OverrideDefaultApiTimeoutSeconds ?? ProtonDriveDefaults.DefaultApiTimeoutSeconds);

        Cache = new PhotosClientCache(entityCacheRepository, secretCacheRepository);
        PhotosApi = new PhotosApiClient(_httpClient);
    }

    internal IPhotosApiClient PhotosApi { get; }

    internal IPhotosClientCache Cache { get; }

    internal ProtonDriveClient DriveClient { get; }

    [Experimental("Photos")]
    public ValueTask<FolderNode> GetPhotosRootAsync(CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.GetPhotosFolderAsync(this, cancellationToken);
    }

    public ValueTask<Result<Node, DegradedNode>?> GetNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        return PhotosNodeOperations
            .EnumerateNodesAsync(this, nodeUid.VolumeId, [nodeUid.LinkId], cancellationToken)
            .Select(x => (Result<Node, DegradedNode>?)x)
            .FirstOrDefaultAsync(cancellationToken: cancellationToken);
    }

    [Experimental("Photos")]
    public IAsyncEnumerable<PhotosTimelineItem> EnumeratePhotosTimelineAsync(NodeUid uid, CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.EnumeratePhotosTimelineAsync(this, uid, cancellationToken);
    }

    public async ValueTask<PhotosDownloader> GetPhotosDownloaderAsync(NodeUid photoUid, CancellationToken cancellationToken)
    {
        return await PhotosDownloader.CreateAsync(this, photoUid, cancellationToken).ConfigureAwait(false);
    }

    public IAsyncEnumerable<FileThumbnail> EnumeratePhotosThumbnailsAsync(
        IEnumerable<NodeUid> photoUids,
        ThumbnailType thumbnailType = ThumbnailType.Thumbnail,
        CancellationToken cancellationToken = default)
    {
        return FileOperations.EnumerateThumbnailsAsync(DriveClient, photoUids, thumbnailType, cancellationToken);
    }

    public void Dispose()
    {
        _httpClient.Dispose();
    }
}
