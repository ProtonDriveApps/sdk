using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Account;

public sealed class AccountClientConfiguration
{
    internal AccountClientConfiguration(string appVersion, ProtonSessionOptions? options = null)
    {
        Sdk = new SdkClientConfiguration(appVersion, options);
        SecretCacheRepository = options?.SecretCacheRepository ?? new InMemoryCacheRepository();
        RefreshRedirectUri = options?.RefreshRedirectUri ?? AccountApiDefaults.RefreshRedirectUri;
    }

    public SdkClientConfiguration Sdk { get; }

    public ICacheRepository SecretCacheRepository { get; }

    public Uri RefreshRedirectUri { get; }

    public ICacheRepository EntityCacheRepository => Sdk.EntityCacheRepository;

    public ITelemetry Telemetry => Sdk.Telemetry;

    public IFeatureFlagProvider FeatureFlagProvider => Sdk.FeatureFlagProvider;
}
