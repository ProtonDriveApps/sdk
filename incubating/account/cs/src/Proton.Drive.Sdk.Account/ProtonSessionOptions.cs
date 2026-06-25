using Proton.Sdk;
using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Account;

public sealed record ProtonSessionOptions : ProtonClientOptions
{
    public ICacheRepository? SecretCacheRepository { get; set; }
    public Uri? RefreshRedirectUri { get; set; }
}
