using Proton.Sdk.Api;

namespace Proton.Sdk.Api.Addresses;

internal sealed class AddressListResponse : ApiResponse
{
    public required IReadOnlyList<AddressDto> Addresses { get; init; }
}
