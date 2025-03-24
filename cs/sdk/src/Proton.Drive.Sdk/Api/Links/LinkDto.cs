using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinkDto
{
    [JsonPropertyName("LinkID")]
    public LinkId Id { get; init; }

    public LinkType Type { get; init; }

    [JsonPropertyName("ParentLinkID")]
    public LinkId? ParentId { get; init; }

    public required LinkState State { get; init; }

    [JsonPropertyName("CreateTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CreationTime { get; init; }

    [JsonPropertyName("ModifyTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime ModificationTime { get; init; }

    [JsonPropertyName("Trashed")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public DateTime? TrashTime { get; init; }

    public required PgpArmoredMessage Name { get; init; }

    [JsonPropertyName("NameHash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> NameHashDigest { get; init; }

    [JsonPropertyName("MIMEType")]
    public string? MediaType { get; init; }

    [JsonPropertyName("NodeKey")]
    public required PgpArmoredPrivateKey Key { get; init; }

    [JsonPropertyName("NodePassphrase")]
    public required PgpArmoredMessage Passphrase { get; init; }

    [JsonPropertyName("NodePassphraseSignature")]
    public PgpArmoredSignature? PassphraseSignature { get; init; }

    [JsonPropertyName("SignatureEmail")]
    public string? SignatureEmailAddress { get; init; }

    [JsonPropertyName("NameSignatureEmail")]
    public string? NameSignatureEmailAddress { get; init; }
}
