using Proton.Sdk.Caching;
using Proton.Sdk.Http;
using Proton.Sdk.Telemetry;

namespace Proton.Sdk;

public record ProtonClientOptions
{
    public Uri? BaseUrl { get; set; }
    public string? UserAgent { get; set; }
    public ProtonClientTlsPolicy? TlsPolicy { get; set; }
    public Func<DelegatingHandler>? CustomHttpMessageHandlerFactory { get; set; }
    public IHttpClientFactory? HttpClientFactory { get; set; }
    public ICacheRepository? EntityCacheRepository { get; set; }
    public ITelemetry? Telemetry { get; set; }
    public IFeatureFlagProvider? FeatureFlagProvider { get; set; }
    internal ICacheRepository? SecretCacheRepository { get; set; }
    internal Uri? RefreshRedirectUri { get; set; }
    internal string? BindingsLanguage { get; set; }
}
