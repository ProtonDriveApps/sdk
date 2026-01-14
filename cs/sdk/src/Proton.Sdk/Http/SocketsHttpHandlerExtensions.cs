using System.Net;
using System.Net.Security;

namespace Proton.Sdk.Http;

internal static class SocketsHttpHandlerExtensions
{
    public static SocketsHttpHandler AddAutomaticDecompression(this SocketsHttpHandler handler)
    {
        handler.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli;
        return handler;
    }

    public static SocketsHttpHandler ConfigureCookies(this SocketsHttpHandler handler, CookieContainer cookieContainer)
    {
        handler.CookieContainer = cookieContainer;
        return handler;
    }

    /// <summary>
    /// Configures the <see cref="SocketsHttpHandler"></see> to apply server certificate public key pinning for an <see cref="HttpClient"/>.
    /// </summary>
    /// <param name="handler">The <see cref="SocketsHttpHandler"/>.</param>
    /// <returns>The handler passed as parameter, for fluent chaining.</returns>
    public static SocketsHttpHandler AddTlsPinning(this SocketsHttpHandler handler)
    {
        handler.SslOptions.RemoteCertificateValidationCallback =
            (_, certificate, chain, sslPolicyErrors) => sslPolicyErrors == SslPolicyErrors.None && TlsRemoteCertificateValidator.Validate(certificate, chain);

        return handler;
    }
}
