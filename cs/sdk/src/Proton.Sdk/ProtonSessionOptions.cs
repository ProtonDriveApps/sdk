using Proton.Sdk.Caching;

namespace Proton.Sdk;

public sealed record ProtonSessionOptions : ProtonClientOptions
{
    public new ICacheRepository? SecretCacheRepository
    {
        get => base.SecretCacheRepository;
        set => base.SecretCacheRepository = value;
    }
}
