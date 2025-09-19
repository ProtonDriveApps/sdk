using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal struct RevisionCreationRequest
{
    [JsonPropertyName("CurrentRevisionID")]
    public RevisionId? CurrentRevisionId { get; init; }

    [JsonPropertyName("ClientUID")]
    public string? ClientId { get; init; }
}
