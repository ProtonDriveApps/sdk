using System.Threading.Channels;
using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;

namespace Proton.Drive.Sdk.Search;

internal static class ProtonDriveClientSearchQueryRunner
{
    /// <summary>
    /// Streams the hits of a query into <paramref name="channel"/>, then completes it.
    /// Failures complete the channel with the mapped exception instead of faulting the returned task,
    /// so the reader is the only one to observe them.
    /// </summary>
    public static async Task RunQueryAsync(
        DriveSearchEngine searchEngine,
        SearchIndex searchIndex,
        SearchQuery query,
        Channel<DriveSearchHit> channel,
        CancellationToken cancellationToken)
    {
        try
        {
            var seen = new HashSet<ProtonDriveNodeUid>();
            var sink = new DriveSearchHitSink(channel.Writer, seen);
            await searchEngine.Search(searchIndex, query, sink, cancellationToken).ConfigureAwait(false);
            channel.Writer.TryComplete();
        }
        catch (Exception exception)
        {
            channel.Writer.TryComplete(SearchExceptionMapper.ToProtonDriveException(exception));
        }
    }
}
