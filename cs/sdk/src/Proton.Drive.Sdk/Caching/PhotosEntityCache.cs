using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Caching;

internal sealed class PhotosEntityCache(ICacheRepository repository) : IPhotosEntityCache
{
    private const string PhotoVolumeIdCacheKey = "volume:photos:id";
    private const string PhotosShareIdCacheKey = "share:photos:id";

    private readonly ICacheRepository _repository = repository;

    public ValueTask SetPhotosVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(PhotoVolumeIdCacheKey, volumeId.ToString(), cancellationToken);
    }

    public async ValueTask<VolumeId?> TryGetPhotosVolumeIdAsync(CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(PhotoVolumeIdCacheKey, cancellationToken).ConfigureAwait(false);

        return value is not null ? (VolumeId?)value : null;
    }

    public ValueTask SetPhotosShareIdAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(PhotosShareIdCacheKey, shareId.ToString(), cancellationToken);
    }

    public async ValueTask<ShareId?> TryGetPhotosShareIdAsync(CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(PhotosShareIdCacheKey, cancellationToken).ConfigureAwait(false);

        return value is not null ? (ShareId)value : null;
    }
}
