using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class OwnedByDto
{
    [JsonPropertyName("Email")]
    public string? Email { get; init; }

    [JsonPropertyName("Organization")]
    public string? Organization { get; init; }
}
