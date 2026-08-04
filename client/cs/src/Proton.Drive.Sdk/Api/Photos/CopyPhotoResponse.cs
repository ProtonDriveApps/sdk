using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class CopyPhotoResponse : ApiResponse
{
    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }
}
