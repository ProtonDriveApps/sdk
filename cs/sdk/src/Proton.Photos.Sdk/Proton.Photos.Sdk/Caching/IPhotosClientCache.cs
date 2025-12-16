namespace Proton.Photos.Sdk.Caching;

internal interface IPhotosClientCache
{
    IPhotosEntityCache Entities { get; }
    IPhotosSecretCache Secrets { get; }
}
