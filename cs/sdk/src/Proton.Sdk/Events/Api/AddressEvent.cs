using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;
using Proton.Sdk.Addresses.Api;

namespace Proton.Sdk.Events.Api;

internal sealed class AddressEvent
{
    public required EventAction Action { get; init; }

    [JsonPropertyName("ID")]
    public required AddressId AddressId { get; init; }

    public AddressDto? Address { get; init; }
}
