using Microsoft.Extensions.Logging;
using Proton.Sdk.Caching;

namespace Proton.Sdk;

public sealed class ProtonClientOptions()
{
    public Uri? BaseUrl { get; set; }
    public string? UserAgent { get; set; }
    public bool? DisableTlsCertificatePinning { get; set; }
    public bool? IgnoreSslCertificateErrors { get; set; }
    public Func<DelegatingHandler>? CustomHttpMessageHandlerFactory { get; set; }
    public ICache<string, ReadOnlyMemory<byte>>? SecretCache { get; set; }
    public ICache<string, string>? EntityCache { get; set; }
    public ILoggerFactory? LoggerFactory { get; set; }
    internal Uri? RefreshRedirectUri { get; set; }
    internal string? BindingsLanguage { get; set; }
}
