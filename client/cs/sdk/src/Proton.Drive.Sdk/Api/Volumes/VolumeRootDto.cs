using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumeRootDto
{
    [JsonPropertyName("ShareID")]
    public required ShareId ShareId { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }
}
