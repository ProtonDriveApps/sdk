using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Account.Api.Addresses;

internal sealed class AddressResponse : ApiResponse
{
    public required AddressDto Address { get; init; }
}
