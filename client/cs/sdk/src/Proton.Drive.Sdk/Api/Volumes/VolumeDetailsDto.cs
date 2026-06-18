using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumeDetailsDto
{
    [JsonPropertyName("ID")]
    public required VolumeId Id { get; set; }

    public required long UsedSpace { get; init; }

    public required VolumeState State { get; init; }

    public required VolumeShareDto Share { get; init; }
}
