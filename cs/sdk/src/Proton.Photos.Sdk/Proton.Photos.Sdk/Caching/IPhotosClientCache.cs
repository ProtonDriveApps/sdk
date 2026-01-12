using Proton.Drive.Sdk.Caching;

namespace Proton.Photos.Sdk.Caching;

internal interface IPhotosClientCache
{
    IPhotosEntityCache Entities { get; }
    IDriveSecretCache Secrets { get; }
}
