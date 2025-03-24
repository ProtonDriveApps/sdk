using Proton.Sdk.Addresses;

namespace Proton.Sdk.Api.Addresses;

internal interface IAddressesApiClient
{
    Task<AddressListResponse> GetAddressesAsync(CancellationToken cancellationToken);

    Task<AddressResponse> GetAddressAsync(AddressId id, CancellationToken cancellationToken);
}
