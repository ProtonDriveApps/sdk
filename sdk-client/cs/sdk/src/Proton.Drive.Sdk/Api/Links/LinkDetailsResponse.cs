using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinkDetailsResponse : ApiResponse
{
    public required IReadOnlyList<LinkDetailsDto> Links { get; init; }
}
