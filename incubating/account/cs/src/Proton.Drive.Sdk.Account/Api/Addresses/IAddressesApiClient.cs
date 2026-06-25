using Proton.Drive.Sdk.Account.Addresses;

namespace Proton.Drive.Sdk.Account.Api.Addresses;

internal interface IAddressesApiClient
{
    Task<AddressListResponse> GetAddressesAsync(CancellationToken cancellationToken);

    Task<AddressResponse> GetAddressAsync(AddressId id, CancellationToken cancellationToken);
}
