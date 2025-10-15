using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class NodeNameAvailabilityRequest
{
    [JsonPropertyName("Hashes")]
    public required IReadOnlyCollection<string> NameHashDigests { get; init; }

    [JsonPropertyName("ClientUID")]
    public required IEnumerable<string> ClientUid { get; init; }
}
