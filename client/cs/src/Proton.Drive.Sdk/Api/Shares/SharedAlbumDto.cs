using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class SharedAlbumDto
{
    [JsonPropertyName("VolumeID")]
    public required VolumeId VolumeId { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }
}
