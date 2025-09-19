using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal readonly struct RevisionCreationIdentity
{
    [JsonPropertyName("ID")]
    public required RevisionId RevisionId { get; init; }
}
