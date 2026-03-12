namespace Proton.Drive.Sdk.Nodes;

public sealed class PhotosFileUploadMetadata : FileUploadMetadata
{
    public DateTime? CaptureTime { get; init; }
    public NodeUid? MainPhotoUid { get; init; }
    public IEnumerable<PhotoTag>? Tags { get; init; }
}
