using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api;

internal sealed class PhotoDetailsResponse : ApiResponse
{
    public required IReadOnlyList<LinkDetailsDto> Links { get; init; }
}
