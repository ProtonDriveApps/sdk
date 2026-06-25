using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Account.Api.Keys;

public sealed class KeySalt
{
    [JsonPropertyName("ID")]
    public required string KeyId { get; init; }

    [JsonPropertyName("KeySalt")]
    public required ReadOnlyMemory<byte> Value { get; init; }
}
