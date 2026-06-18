using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Http;

internal sealed class CryptographyTimeProvisionHandler : DelegatingHandler
{
    private static readonly CryptographyTimeProvider CryptographyTimeProvider = new();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var responseMessage = await base.SendAsync(request, cancellationToken).ConfigureAwait(false);

        if (responseMessage.Headers.Date is { } time)
        {
            CryptographyTimeProvider.UpdateTime(time);
            PgpEnvironment.DefaultTimeProviderOverride = CryptographyTimeProvider;
        }

        return responseMessage;
    }
}
