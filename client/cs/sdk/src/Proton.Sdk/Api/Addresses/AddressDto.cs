using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;

namespace Proton.Sdk.Api.Addresses;

internal sealed record AddressDto
{
    [JsonPropertyName("ID")]
    public required AddressId Id { get; init; }

    public required string Email { get; init; }

    public required AddressStatus Status { get; init; }

    public required int Order { get; init; }

    public required IReadOnlyList<AddressKeyDto> Keys { get; init; }
}
