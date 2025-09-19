using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumeShareDto
{
    [JsonPropertyName("ShareID")]
    public required ShareId ShareId { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }
}
