using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Account.Api.Addresses;

namespace Proton.Drive.Sdk.Account.Api.Events;

internal sealed class AddressEvent
{
    public required EventAction Action { get; init; }

    [JsonPropertyName("ID")]
    public required AddressId AddressId { get; init; }

    public AddressDto? Address { get; init; }
}
