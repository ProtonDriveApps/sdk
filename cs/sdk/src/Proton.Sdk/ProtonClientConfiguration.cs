using Proton.Sdk.Caching;
using Proton.Sdk.Http;
using Proton.Sdk.Telemetry;

namespace Proton.Sdk;

internal sealed class ProtonClientConfiguration(string appVersion, ProtonClientOptions? options = null)
{
    public Uri BaseUrl { get; } = options?.BaseUrl ?? ProtonApiDefaults.BaseUrl;
    public string AppVersion { get; } = appVersion;
    public string UserAgent { get; } = options?.UserAgent ?? string.Empty;

    public ProtonClientTlsPolicy TlsPolicy { get; } =
        options?.TlsPolicy is { } tlsPolicy && Enum.IsDefined(tlsPolicy)
            ? tlsPolicy
            : ProtonClientTlsPolicy.Strict;

    public Func<DelegatingHandler>? CustomHttpMessageHandlerFactory { get; } = options?.CustomHttpMessageHandlerFactory;
    public ICacheRepository SecretCacheRepository { get; } = options?.SecretCacheRepository ?? new InMemoryCacheRepository();
    public ICacheRepository EntityCacheRepository { get; } = options?.EntityCacheRepository ?? new InMemoryCacheRepository();
    public ITelemetry Telemetry { get; } = options?.Telemetry ?? NullTelemetry.Instance;
    public IFeatureFlagProvider FeatureFlagProvider { get; } = options?.FeatureFlagProvider ?? AlwaysDisabledFeatureFlagProvider.Instance;
    public Uri RefreshRedirectUri { get; } = options?.RefreshRedirectUri ?? ProtonApiDefaults.RefreshRedirectUri;
    public string? BindingsLanguage { get; } = options?.BindingsLanguage;
}
