using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class CopyPhotoFailureResponse : ApiResponse
{
    public CopyPhotoFailureDetails? Details { get; init; }
}
