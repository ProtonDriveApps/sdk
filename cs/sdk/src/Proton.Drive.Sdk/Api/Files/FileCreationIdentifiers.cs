using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class FileCreationIdentifiers
{
    [JsonPropertyName("ID")]
    public required LinkId LinkId { get; init; }

    [JsonPropertyName("RevisionID")]
    public required RevisionId RevisionId { get; init; }
}
