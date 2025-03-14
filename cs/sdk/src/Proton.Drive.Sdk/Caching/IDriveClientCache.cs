namespace Proton.Drive.Sdk.Caching;

internal interface IDriveClientCache
{
    IDriveEntityCache Entities { get; }
    IDriveSecretCache Secrets { get; }
}
