using Proton.Sdk.Api;

namespace Proton.Sdk.Addresses.Api;

internal sealed class AddressListResponse : ApiResponse
{
    public required IReadOnlyList<AddressDto> Addresses { get; init; }
}
