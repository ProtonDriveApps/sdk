using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Http;

internal sealed class CryptographyTimeProvisionHandler : DelegatingHandler
{
    private readonly CryptographyTimeProvider _cryptographyTimeProvider = new();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var responseMessage = await base.SendAsync(request, cancellationToken).ConfigureAwait(false);

        if (responseMessage.Headers.Date is { } time)
        {
            _cryptographyTimeProvider.ServerTime = time;
            PgpEnvironment.DefaultTimeProviderOverride = _cryptographyTimeProvider;
        }

        return responseMessage;
    }

    private sealed class CryptographyTimeProvider : TimeProvider
    {
        public DateTimeOffset ServerTime { get; set; }

        public override DateTimeOffset GetUtcNow()
        {
            return ServerTime;
        }
    }
}
