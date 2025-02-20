namespace Proton.Sdk.Addresses.Api;

internal interface IAddressesApiClient
{
    Task<AddressListResponse> GetAddressesAsync(CancellationToken cancellationToken);

    Task<AddressResponse> GetAddressAsync(AddressId id, CancellationToken cancellationToken);
}
