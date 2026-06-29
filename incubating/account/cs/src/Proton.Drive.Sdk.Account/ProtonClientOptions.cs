using Proton.Drive.Sdk.Account.Http;
using Proton.Sdk.Caching;
using Proton.Sdk.Configuration;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Account;

public record ProtonClientOptions
{
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
