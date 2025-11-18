using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class ActiveRevisionDto
{
    [JsonPropertyName("RevisionID")]
    public required RevisionId Id { get; init; }

    [JsonPropertyName("CreateTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CreationTime { get; init; }

    [JsonPropertyName("EncryptedSize")]
    public required long StorageQuotaConsumption { get; init; }

    public PgpArmoredSignature? ManifestSignature { get; init; }

    [JsonPropertyName("XAttr")]
    public PgpArmoredMessage? ExtendedAttributes { get; init; }

    public required IReadOnlyList<ThumbnailDtoV2> Thumbnails { get; init; }

    [JsonPropertyName("SignatureEmail")]
    public string? SignatureEmailAddress { get; init; }
}
