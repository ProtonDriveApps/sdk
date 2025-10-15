using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class NodeNameAvailabilityResponse : ApiResponse
{
    [JsonPropertyName("AvailableHashes")]
    public required IReadOnlyList<string> AvailableNameHashDigests { get; init; }

    [JsonPropertyName("PendingHashes")]
    public required IReadOnlyList<string> UnavailableNameHashDigests { get; init; }
}
