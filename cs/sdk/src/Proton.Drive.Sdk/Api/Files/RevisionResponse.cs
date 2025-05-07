using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class RevisionResponse : ApiResponse
{
    public required BlockListingRevisionDto Revision { get; init; }
}
