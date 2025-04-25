using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class BlockRequestResponse : ApiResponse
{
    [JsonPropertyName("UploadLinks")]
    public required IReadOnlyList<BlockUploadTarget> UploadTargets { get; set; }

    [JsonPropertyName("ThumbnailLinks")]
    public required IReadOnlyList<ThumbnailBlockUploadTarget> ThumbnailUploadTargets { get; set; }
}
