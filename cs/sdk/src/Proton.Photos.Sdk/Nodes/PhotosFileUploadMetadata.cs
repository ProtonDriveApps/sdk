using Proton.Drive.Sdk.Nodes;
using Proton.Photos.Sdk.Api.Photos;

namespace Proton.Photos.Sdk.Nodes;

public sealed class PhotosFileUploadMetadata : FileUploadMetadata
{
    public DateTime? CaptureTime { get; init; }

    public string? MainPhotoLinkId { get; init; }

    public long? ExpectedSize { get; init; }

    public IEnumerable<PhotoTag>? Tags { get; init; }
}
