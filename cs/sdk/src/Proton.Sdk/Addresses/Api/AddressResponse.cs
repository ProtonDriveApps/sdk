using Proton.Sdk.Api;

namespace Proton.Sdk.Addresses.Api;

internal sealed class AddressResponse : ApiResponse
{
    public required AddressDto Address { get; init; }
}
