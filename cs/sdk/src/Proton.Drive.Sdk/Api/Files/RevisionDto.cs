using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal class RevisionDto
{
    [JsonPropertyName("ID")]
    public required string Id { get; init; }

    [JsonPropertyName("ClientUID")]
    public string? ClientId { get; init; }

    [JsonPropertyName("CreateTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CreationTime { get; init; }

    public required long Size { get; init; }

    public PgpArmoredSignature? ManifestSignature { get; init; }

    [JsonPropertyName("SignatureEmail")]
    public string? SignatureEmailAddress { get; init; }

    public required RevisionState State { get; init; }

    [JsonPropertyName("XAttr")]
    public PgpArmoredMessage? ExtendedAttributes { get; init; }

    public IReadOnlyList<ThumbnailDto>? Thumbnails { get; init; }
}
