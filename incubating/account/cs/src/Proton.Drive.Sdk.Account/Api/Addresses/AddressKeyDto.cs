using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Account.Api.Addresses;

internal sealed class AddressKeyDto
{
    [JsonPropertyName("ID")]
    public required AddressKeyId Id { get; init; }

    public required int Version { get; init; }

    public required PgpArmoredSecretKey PrivateKey { get; init; }

    public PgpArmoredMessage? Token { get; init; }

    public PgpArmoredSignature? Signature { get; init; }

    [JsonPropertyName("Primary")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsPrimary { get; init; }

    [JsonPropertyName("Active")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsActive { get; init; }

    [JsonPropertyName("Flags")]
    public required AddressKeyCapabilities Capabilities { get; init; }
}
