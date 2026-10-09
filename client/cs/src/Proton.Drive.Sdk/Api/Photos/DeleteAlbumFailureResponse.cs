using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class DeleteAlbumFailureResponse : ApiResponse
{
    public DeleteAlbumFailureDetails? Details { get; init; }
}
