using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Addresses.Api;

internal sealed class AddressKeyDto
{
    [JsonPropertyName("ID")]
    public required string Id { get; init; }

    public required int Version { get; init; }

    public PgpArmoredPrivateKey PrivateKey { get; init; }

    public PgpArmoredMessage? Token { get; init; }

    public PgpArmoredSignature? Signature { get; init; }

    [JsonPropertyName("Primary")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsPrimary { get; init; }

    [JsonPropertyName("Active")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsActive { get; init; }

    public required AddressKeyCapabilities Capabilities { get; init; }
}
