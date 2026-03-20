using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class ShareListResponse : ApiResponse
{
    public required IReadOnlyList<ShareListItemDto> Shares { get; init; }
}
