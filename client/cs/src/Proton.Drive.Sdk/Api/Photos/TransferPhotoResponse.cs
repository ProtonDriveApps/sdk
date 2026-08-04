using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class TransferPhotoResponse : ApiResponse
{
    public PhotoTransferDetails? Details { get; init; }
}
