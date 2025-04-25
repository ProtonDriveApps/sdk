using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class ThumbnailBlockUploadTarget : BlockUploadTarget
{
    [JsonPropertyName("ThumbnailType")]
    public required ThumbnailType Type { get; set; }
}
