using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Account.Api.Addresses;

internal sealed class AddressListResponse : ApiResponse
{
    public required IReadOnlyList<AddressDto> Addresses { get; init; }
}
