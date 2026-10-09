namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class CreateAlbumRequest
{
    public required bool Locked { get; init; }

    public required AlbumLinkCreationRequest Link { get; init; }
}
