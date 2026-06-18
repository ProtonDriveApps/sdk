namespace Proton.Sdk.Caching;

internal sealed class AccountClientCache(
    ICacheRepository entityCacheRepository,
    ICacheRepository secretCacheRepository,
    ISessionSecretCache sessionSecretCache) : IAccountClientCache
{
    public IAccountEntityCache Entities { get; } = new AccountEntityCache(entityCacheRepository);
    public IAccountSecretCache Secrets { get; } = new AccountSecretCache(secretCacheRepository);
    public ISessionSecretCache SessionSecrets { get; } = sessionSecretCache;
    public IPublicKeyCache PublicKeys { get; } = new PublicKeyCache();
}
