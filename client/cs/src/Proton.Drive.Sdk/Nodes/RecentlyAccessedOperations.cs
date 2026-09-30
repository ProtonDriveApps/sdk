using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Nodes;

internal static class RecentlyAccessedOperations
{
    private const int BatchSize = 50;

    public static ValueTask ReportDriveAsync(
        ProtonDriveClient client,
        IEnumerable<RecentlyAccessedReportItem> items,
        CancellationToken cancellationToken)
    {
        return ReportAsync(client, items, client.Api.Links.ReportRecentlyAccessedAsync, cancellationToken);
    }

    public static ValueTask ReportPhotosAsync(
        ProtonDriveClient client,
        IEnumerable<RecentlyAccessedReportItem> items,
        CancellationToken cancellationToken)
    {
        return ReportAsync(client, items, client.Api.Photos.ReportRecentlyAccessedAsync, cancellationToken);
    }

    private static async ValueTask ReportAsync(
        ProtonDriveClient client,
        IEnumerable<RecentlyAccessedReportItem> items,
        Func<ReportRecentlyAccessedItemsRequest, CancellationToken, ValueTask> postAsync,
        CancellationToken cancellationToken)
    {
        var resolvedItems = items.Select(item => ToApiItem(client, item));

        foreach (var batch in resolvedItems.Chunk(BatchSize))
        {
            await postAsync(
                new ReportRecentlyAccessedItemsRequest { RecentlyAccessedItems = batch },
                cancellationToken).ConfigureAwait(false);
        }
    }

    private static ReportRecentlyAccessedItemDto ToApiItem(ProtonDriveClient client, RecentlyAccessedReportItem item)
    {
        var accessTime = item.AccessTime ?? client.TimeProvider.GetUtcNow();
        var unixSeconds = accessTime.ToUnixTimeSeconds();

        return new ReportRecentlyAccessedItemDto
        {
            VolumeId = item.NodeUid.VolumeId,
            LinkId = item.NodeUid.LinkId,
            AccessTime = unixSeconds,
        };
    }
}
