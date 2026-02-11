using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Caching;

internal class PhotosClientCache(
    ICacheRepository entityCacheRepository,
    ICacheRepository secretCacheRepository) : IPhotosClientCache
{
    public IPhotosEntityCache Entities { get; } = new PhotosEntityCache(entityCacheRepository);
    public IDriveSecretCache Secrets { get; } = new DriveSecretCache(secretCacheRepository);
}
