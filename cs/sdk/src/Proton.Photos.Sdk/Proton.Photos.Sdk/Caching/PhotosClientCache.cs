using Proton.Sdk.Caching;

namespace Proton.Photos.Sdk.Caching;

internal class PhotosClientCache(
    ICacheRepository entityCacheRepository,
    ICacheRepository secretCacheRepository) : IPhotosClientCache
{
    public IPhotosEntityCache Entities { get; } = new PhotosEntityCache(entityCacheRepository);
    public IPhotosSecretCache Secrets { get; } = new PhotosSecretCache(secretCacheRepository);
}
