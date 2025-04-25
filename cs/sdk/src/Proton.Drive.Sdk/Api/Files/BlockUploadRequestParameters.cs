using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class BlockUploadRequestParameters
{
    [JsonPropertyName("AddressID")]
    public required AddressId AddressId { get; init; }

    [JsonPropertyName("VolumeID")]
    public required VolumeId VolumeId { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }

    [JsonPropertyName("RevisionID")]
    public required RevisionId RevisionId { get; init; }

    [JsonPropertyName("BlockList")]
    public required IReadOnlyList<BlockCreationParameters> Blocks { get; init; }

    [JsonPropertyName("ThumbnailList")]
    public required IReadOnlyList<ThumbnailCreationParameters> Thumbnails { get; init; }
}
