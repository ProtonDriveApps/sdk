using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class RevisionCreationResponse : ApiResponse
{
    [JsonPropertyName("Revision")]
    public required RevisionCreationIdentity Identity { get; init; }
}
