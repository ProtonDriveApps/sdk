using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class TransferPhotoLinkItem
{
    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }

    [JsonPropertyName("Hash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> NameHashDigest { get; init; }

    [JsonPropertyName("OriginalHash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> OriginalNameHashDigest { get; init; }

    public required PgpArmoredMessage Name { get; init; }

    [JsonPropertyName("NodePassphrase")]
    public required PgpArmoredMessage Passphrase { get; init; }

    [JsonPropertyName("ContentHash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> ContentHash { get; init; }

    // Sent explicitly as null: the API requires it only when moving an anonymous node.
    [JsonPropertyName("NodePassphraseSignature")]
    public PgpArmoredSignature? PassphraseSignature { get; init; }
}
