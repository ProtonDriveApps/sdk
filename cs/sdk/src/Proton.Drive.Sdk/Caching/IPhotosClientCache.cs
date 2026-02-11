namespace Proton.Drive.Sdk.Caching;

internal interface IPhotosClientCache
{
    IPhotosEntityCache Entities { get; }
    IDriveSecretCache Secrets { get; }
}
