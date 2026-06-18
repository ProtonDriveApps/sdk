using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Caching;

internal sealed class DriveClientCache(
    ICacheRepository entityCacheRepository,
    ICacheRepository secretCacheRepository) : IDriveClientCache
{
    public IDriveEntityCache Entities { get; } = new DriveEntityCache(entityCacheRepository);
    public IDriveSecretCache Secrets { get; } = new DriveSecretCache(secretCacheRepository);
}
