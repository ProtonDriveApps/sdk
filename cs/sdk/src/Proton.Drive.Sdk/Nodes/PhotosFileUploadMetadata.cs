using Proton.Drive.Sdk.Api.Photos;

namespace Proton.Drive.Sdk.Nodes;

public sealed class PhotosFileUploadMetadata : FileUploadMetadata
{
    public DateTime? CaptureTime { get; init; }

    public string? MainPhotoLinkId { get; init; }

    public long? ExpectedSize { get; init; }

    public ReadOnlyMemory<byte>? ExpectedSha1 { get; init; }

    public IEnumerable<PhotoTag>? Tags { get; init; }
}
