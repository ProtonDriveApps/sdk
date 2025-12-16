using System.Diagnostics.CodeAnalysis;
using Proton.Drive.Sdk;
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
    private const int ApiTimeoutSeconds = 20;

    private readonly HttpClient _httpClient;

    public ProtonPhotosClient(ProtonApiSession session, string? uid = null)
    {
        DriveClient = new ProtonDriveClient(session, uid);

        _httpClient = session.GetHttpClient(ProtonDriveDefaults.DriveBaseRoute, TimeSpan.FromSeconds(ApiTimeoutSeconds));

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
        string? uid = null)
    {
        DriveClient = new ProtonDriveClient(
            httpClientFactory,
            accountClient,
            entityCacheRepository,
            secretCacheRepository,
            featureFlagProvider,
            telemetry,
            uid);

        _httpClient = new SdkHttpClientFactoryDecorator(httpClientFactory).CreateClient();

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

    [Experimental("Photos")]
    public IAsyncEnumerable<PhotosTimelineItem> EnumeratePhotosTimelineAsync(NodeUid uid, CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.EnumeratePhotosAsync(this, uid, cancellationToken);
    }

    public async ValueTask<PhotoDownloader> GetPhotoDownloaderAsync(NodeUid photoUid, CancellationToken cancellationToken)
    {
        return await PhotoDownloader.CreateAsync(this, photoUid, cancellationToken).ConfigureAwait(false);
    }

    public void Dispose()
    {
        _httpClient.Dispose();
    }
}
