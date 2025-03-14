using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Volumes.Api;

internal sealed class VolumeRoot
{
    [JsonPropertyName("ShareID")]
    public required ShareId ShareId { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }
}
