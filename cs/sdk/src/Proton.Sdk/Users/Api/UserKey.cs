using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Users.Api;

internal sealed class UserKey
{
    [JsonPropertyName("ID")]
    public required UserKeyId Id { get; init; }

    public required int Version { get; init; }

    public required PgpArmoredPrivateKey PrivateKey { get; init; }

    [JsonPropertyName("Primary")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsPrimary { get; init; }

    [JsonPropertyName("Active")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsActive { get; init; }
}
