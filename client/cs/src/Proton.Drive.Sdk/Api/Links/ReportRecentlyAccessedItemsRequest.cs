namespace Proton.Drive.Sdk.Api.Links;

internal sealed class ReportRecentlyAccessedItemsRequest
{
    public required IReadOnlyList<ReportRecentlyAccessedItemDto> RecentlyAccessedItems { get; init; }
}
