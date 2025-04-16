using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class ShareVolumeDto
{
    [JsonPropertyName("VolumeID")]
    public required VolumeId Id { get; init; }

    public required long UsedSpace { get; init; }
}
