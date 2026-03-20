using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class ShareListItemDto
{
    [JsonPropertyName("ShareID")]
    public required ShareId Id { get; init; }

    [JsonPropertyName("VolumeID")]
    public required VolumeId VolumeId { get; init; }

    public required ShareType Type { get; init; }

    public required ShareState State { get; init; }

    public required VolumeType VolumeType { get; init; }

    [JsonPropertyName("Creator")]
    public required string CreatorEmailAddress { get; init; }

    [JsonPropertyName("Locked")]
    public bool? IsLocked { get; init; }

    [JsonPropertyName("CreateTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CreationTime { get; init; }

    [JsonPropertyName("ModifyTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime ModificationTime { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId RootLinkId { get; init; }
}
