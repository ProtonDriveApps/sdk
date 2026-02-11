namespace Proton.Sdk.Api.Addresses;

internal sealed class AddressResponse : ApiResponse
{
    public required AddressDto Address { get; init; }
}
