using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class FileCreationResponse : ApiResponse
{
    [JsonPropertyName("File")]
    public required FileCreationIdentifiers Identifiers { get; init; }
}
