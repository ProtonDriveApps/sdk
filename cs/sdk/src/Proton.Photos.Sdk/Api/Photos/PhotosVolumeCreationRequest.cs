namespace Proton.Photos.Sdk.Api.Photos;

internal sealed class PhotosVolumeCreationRequest
{
    public required PhotosVolumeShareCreationParameters Share { get; init; }
    public required PhotosVolumeLinkCreationParameters Link { get; init; }
}
