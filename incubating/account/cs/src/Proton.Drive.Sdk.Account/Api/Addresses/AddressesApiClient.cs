using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Account.Serialization;
using Proton.Sdk.Api.Http;

namespace Proton.Drive.Sdk.Account.Api.Addresses;

internal sealed class AddressesApiClient(HttpClient httpClient) : IAddressesApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async Task<AddressListResponse> GetAddressesAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.AddressListResponse)
            .GetAsync("core/v4/addresses", cancellationToken).ConfigureAwait(false);
    }

    public async Task<AddressResponse> GetAddressAsync(AddressId id, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.AddressResponse)
            .GetAsync($"core/v4/addresses/{id}", cancellationToken).ConfigureAwait(false);
    }
}
