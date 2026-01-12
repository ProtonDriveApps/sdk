using Proton.Sdk.Api;

namespace Proton.Photos.Sdk.Api;

internal sealed class PhotoDetailsResponse : ApiResponse
{
    public required IReadOnlyList<PhotoLinkDetailsDto> Links { get; init; }
}
