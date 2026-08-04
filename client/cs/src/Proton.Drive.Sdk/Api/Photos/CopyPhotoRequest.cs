using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class CopyPhotoRequest
{
    [JsonPropertyName("TargetVolumeID")]
    public required VolumeId TargetVolumeId { get; init; }

    [JsonPropertyName("TargetParentLinkID")]
    public required LinkId TargetParentLinkId { get; init; }

    [JsonPropertyName("Hash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> NameHashDigest { get; init; }

    public required PgpArmoredMessage Name { get; init; }

    [JsonPropertyName("NameSignatureEmail")]
    public required string NameSignatureEmailAddress { get; init; }

    [JsonPropertyName("NodePassphrase")]
    public required PgpArmoredMessage Passphrase { get; init; }

    [JsonPropertyName("NodePassphraseSignature")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PgpArmoredSignature? PassphraseSignature { get; init; }

    [JsonPropertyName("SignatureEmail")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SignatureEmailAddress { get; init; }

    [JsonPropertyName("Photos")]
    public required CopyPhotoContent Photos { get; init; }
}
