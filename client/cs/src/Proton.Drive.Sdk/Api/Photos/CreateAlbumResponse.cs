using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class CreateAlbumResponse : ApiResponse
{
    public required CreatedAlbumDto Album { get; init; }
}
