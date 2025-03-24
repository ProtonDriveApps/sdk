using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Api.Keys;

internal sealed class KeysApiClient(HttpClient httpClient) : IKeysApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async Task<AddressPublicKeyListResponse> GetActivePublicKeysAsync(string emailAddress, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.AddressPublicKeyListResponse)
            .GetAsync($"core/v4/keys/all?InternalOnly=1&Email={emailAddress}", cancellationToken).ConfigureAwait(false);
    }

    public async Task<KeySaltListResponse> GetKeySaltsAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.KeySaltListResponse)
            .GetAsync("core/v4/keys/salts", cancellationToken).ConfigureAwait(false);
    }
}
