using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Proton.Sdk.Caching;

namespace Proton.Sdk;

internal sealed class ProtonClientConfiguration(string appVersion, ProtonClientOptions? options)
{
    public Uri BaseUrl { get; } = options?.BaseUrl ?? ProtonApiDefaults.BaseUrl;
    public string AppVersion { get; } = appVersion;
    public string UserAgent { get; } = options?.UserAgent ?? string.Empty;
    public bool DisableTlsCertificatePinning { get; } = options?.DisableTlsCertificatePinning ?? false;
    public bool IgnoreSslCertificateErrors { get; } = options?.IgnoreSslCertificateErrors ?? false;
    public Func<DelegatingHandler>? CustomHttpMessageHandlerFactory { get; } = options?.CustomHttpMessageHandlerFactory;
    public ICache<string, ReadOnlyMemory<byte>> SecretCache { get; } = options?.SecretCache ?? new NullCache<string, ReadOnlyMemory<byte>>();
    public ICache<string, string> EntityCache { get; } = options?.EntityCache ?? new NullCache<string, string>();
    public ILoggerFactory LoggerFactory { get; } = options?.LoggerFactory ?? NullLoggerFactory.Instance;
    public Uri RefreshRedirectUri { get; } = options?.RefreshRedirectUri ?? ProtonApiDefaults.RefreshRedirectUri;
    public string? BindingsLanguage { get; } = options?.BindingsLanguage;
}
