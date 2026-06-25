using Proton.Sdk.Caching;
using Proton.Sdk.Http;
using Proton.Sdk.Telemetry;

namespace Proton.Sdk;

public sealed class SdkClientConfiguration
{
    public SdkClientConfiguration(string appVersion, ProtonClientOptions? options = null)
    {
        BaseUrl = options?.BaseUrl ?? ProtonApiDefaults.BaseUrl;
        AppVersion = appVersion;
        UserAgent = options?.UserAgent ?? string.Empty;
        TlsPolicy = options?.TlsPolicy is { } tlsPolicy && Enum.IsDefined(tlsPolicy)
            ? tlsPolicy
            : ProtonClientTlsPolicy.Strict;
        CustomHttpMessageHandlerFactory = options?.CustomHttpMessageHandlerFactory;
        EntityCacheRepository = options?.EntityCacheRepository ?? new InMemoryCacheRepository();
        Telemetry = options?.Telemetry ?? NullTelemetry.Instance;
        FeatureFlagProvider = options?.FeatureFlagProvider ?? AlwaysDisabledFeatureFlagProvider.Instance;
        BindingsLanguage = options?.BindingsLanguage;
    }

    public Uri BaseUrl { get; }

    public string AppVersion { get; }

    public string UserAgent { get; }

    public ProtonClientTlsPolicy TlsPolicy { get; }

    public Func<DelegatingHandler>? CustomHttpMessageHandlerFactory { get; }

    public ICacheRepository EntityCacheRepository { get; }

    public ITelemetry Telemetry { get; }

    public IFeatureFlagProvider FeatureFlagProvider { get; }

    public string? BindingsLanguage { get; }
}
