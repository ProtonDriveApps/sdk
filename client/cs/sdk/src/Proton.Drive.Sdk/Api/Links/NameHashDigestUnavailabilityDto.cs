using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class NameHashDigestUnavailabilityDto
{
    [JsonPropertyName("Hash")]
    public required string NameHashDigest { get; init; }

    [JsonPropertyName("RevisionID")]
    public required RevisionId RevisionId { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; set; }

    [JsonPropertyName("ClientUID")]
    public required string ClientUid { get; set; }
}
