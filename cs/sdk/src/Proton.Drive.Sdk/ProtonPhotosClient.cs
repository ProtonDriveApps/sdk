using System.Diagnostics.CodeAnalysis;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.Http;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk;

public sealed class ProtonPhotosClient : IDisposable
{
    private readonly HttpClient _httpClient;

    public ProtonPhotosClient(ProtonApiSession session, string? uid = null)
    {
        DriveClient = new ProtonDriveClient(session, uid);
        _httpClient = session.GetHttpClient(ProtonDriveDefaults.DriveBaseRoute, TimeSpan.FromSeconds(ProtonApiDefaults.DefaultTimeoutSeconds));

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
        _httpClient = new SdkHttpClientFactoryDecorator(httpClientFactory).CreateClientWithTimeout(
            creationParameters?.OverrideDefaultApiTimeoutSeconds ?? ProtonApiDefaults.DefaultTimeoutSeconds);

        Cache = new PhotosClientCache(entityCacheRepository, secretCacheRepository);
        PhotosApi = new PhotosApiClient(_httpClient);
    }

    internal IPhotosApiClient PhotosApi { get; }

    internal IPhotosClientCache Cache { get; }

    internal ProtonDriveClient DriveClient { get; }

    public static ValueTask<PhotosFileUploader> GetFileUploaderAsync(string name, PhotosFileUploadMetadata metadata, CancellationToken cancellationToken)
    {
        throw new NotSupportedException();
    }

    public static ValueTask<IReadOnlyList<string>> FindDuplicatesAsync(string name, Action<string> generateSha1, CancellationToken cancellationToken)
    {
        throw new NotSupportedException();
    }

    public ValueTask<Result<Node, DegradedNode>?> GetNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        return DriveClient.GetNodeAsync(nodeUid, cancellationToken);
    }

    public IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateNodesAsync(IEnumerable<NodeUid> nodeUids, CancellationToken cancellationToken = default)
    {
        return NodeOperations.EnumerateNodesAsync(DriveClient, nodeUids, cancellationToken);
    }

    [Experimental("Photos")]
    public IAsyncEnumerable<PhotosTimelineItem> EnumerateTimelineAsync(CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.EnumeratePhotosTimelineAsync(this, cancellationToken);
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
        return FileOperations.EnumerateThumbnailsAsync(DriveClient, photoUids, thumbnailType, cancellationToken);
    }

    public void Dispose()
    {
        _httpClient.Dispose();
    }

    [Experimental("Photos")]
    internal ValueTask<FolderNode> GetPhotosRootAsync(CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.GetPhotosFolderAsync(this, cancellationToken);
    }
}
