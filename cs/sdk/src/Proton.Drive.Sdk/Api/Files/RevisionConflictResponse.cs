using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class RevisionConflictResponse : ApiResponse
{
    [JsonPropertyName("Details")]
    public required RevisionConflict Conflict { get; init; }
}
