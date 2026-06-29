using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Devices;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceDataDto
{
    [JsonPropertyName("DeviceID")]
    public required DeviceUid Id { get; init; }

    [JsonPropertyName("VolumeID")]
    public required VolumeId VolumeId { get; init; }

    public required DeviceType Type { get; init; }

    [JsonPropertyName("CreateTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CreationTime { get; init; }

    [JsonPropertyName("LastSyncTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public DateTime? LastSyncTime { get; init; }
}
