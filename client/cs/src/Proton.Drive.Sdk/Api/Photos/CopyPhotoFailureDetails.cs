using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class CopyPhotoFailureDetails
{
    [JsonPropertyName("Missing")]
    public IReadOnlyList<LinkId>? Missing { get; init; }
}
