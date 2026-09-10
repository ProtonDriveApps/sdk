using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed record MoveMultipleLinksItem
{
    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }

    public required PgpArmoredMessage Name { get; init; }

    [JsonPropertyName("NodePassphrase")]
    public required PgpArmoredMessage Passphrase { get; init; }

    [JsonPropertyName("Hash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> TargetNameDigest { get; init; }

    [JsonPropertyName("OriginalHash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> CurrentNameDigest { get; init; }

    [JsonPropertyName("NodePassphraseSignature")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public required PgpArmoredSignature? PassphraseSignature { get; init; }
}
