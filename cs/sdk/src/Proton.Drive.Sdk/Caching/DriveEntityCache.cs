using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Caching;

internal sealed class DriveEntityCache(ICacheRepository repository) : IDriveEntityCache
{
    private const string MainVolumeIdCacheKey = "volume:main:id";

    private readonly ICacheRepository _repository = repository;

    public ValueTask SetMainVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(MainVolumeIdCacheKey, volumeId.Value, cancellationToken);
    }

    public async ValueTask<VolumeId?> TryGetMainVolumeIdAsync(CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(MainVolumeIdCacheKey, cancellationToken).ConfigureAwait(false);

        return value is not null ? (VolumeId?)value : null;
    }
}
