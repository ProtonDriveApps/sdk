using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class AlbumDto
{
    [JsonPropertyName("NodeHashKey")]
    public required PgpArmoredMessage HashKey { get; init; }

    [JsonPropertyName("XAttr")]
    public PgpArmoredMessage? ExtendedAttributes { get; init; }

    public int PhotoCount { get; init; }

    [JsonPropertyName("CoverLinkID")]
    public LinkId? CoverLinkId { get; init; }

    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public DateTime LastActivityTime { get; init; }
}
