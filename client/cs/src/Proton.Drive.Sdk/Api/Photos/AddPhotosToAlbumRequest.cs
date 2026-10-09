using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class AddPhotosToAlbumRequest
{
    [JsonPropertyName("AlbumData")]
    public required IReadOnlyList<AlbumPhotoLinkItem> AlbumData { get; init; }
}
