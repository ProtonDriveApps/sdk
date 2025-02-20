using System.Text.Json.Serialization;
using Proton.Sdk.Api;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Keys.Api;

internal sealed class AddressPublicKeyListResponse : ApiResponse
{
    public required PublicKeyListAddress Address { get; init; }

    public IReadOnlyList<string>? Warnings { get; init; }

    [JsonPropertyName("ProtonMX")]
    public required bool IsProtonMxDomain { get; init; }

    [JsonPropertyName("IsProton")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsProtonAddress { get; init; }
}
