using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Account.Users;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Account.Api.Users;

internal sealed class UserKeyDto
{
    [JsonPropertyName("ID")]
    public required UserKeyId Id { get; init; }

    public required int Version { get; init; }

    public required PgpArmoredSecretKey PrivateKey { get; init; }

    [JsonPropertyName("Primary")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsPrimary { get; init; }

    [JsonPropertyName("Active")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsActive { get; init; }
}
