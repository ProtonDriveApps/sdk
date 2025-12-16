using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumeDto
{
    [JsonPropertyName("VolumeID")]
    public required VolumeId Id { get; set; }

    public long? MaxSpace { get; init; }

    public required long UsedSpace { get; init; }

    public required VolumeState State { get; init; }

    public required VolumeType Type { get; init; }

    [JsonPropertyName("Share")]
    public required VolumeRootDto Root { get; init; }
}
