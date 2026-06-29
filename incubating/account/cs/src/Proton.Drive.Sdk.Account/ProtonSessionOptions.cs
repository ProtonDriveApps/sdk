using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Account;

public sealed record ProtonSessionOptions : ProtonClientOptions
{
    public Uri? AccountBaseUrl { get; set; }

    public new ICacheRepository? SecretCacheRepository
    {
        get => base.SecretCacheRepository;
        set => base.SecretCacheRepository = value;
    }
}
