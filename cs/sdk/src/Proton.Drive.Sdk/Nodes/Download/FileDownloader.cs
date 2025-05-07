namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class FileDownloader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly RevisionUid _revisionUid;
    private volatile int _remainingNumberOfBlocksToList;

    internal FileDownloader(ProtonDriveClient client, RevisionUid revisionUid)
    {
        _client = client;
        _revisionUid = revisionUid;
    }

    public DownloadController DownloadToStream(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var task = DownloadToStreamAsync(contentOutputStream, onProgress, cancellationToken);

        return new DownloadController(task);
    }

    public void Dispose()
    {
        if (_remainingNumberOfBlocksToList <= 0)
        {
            return;
        }

        _client.BlockListingSemaphore.Release(_remainingNumberOfBlocksToList);
        _remainingNumberOfBlocksToList = 0;
    }

    private async Task DownloadToStreamAsync(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        using var revisionReader = await RevisionOperations.OpenForReadingAsync(_client, _revisionUid, ReleaseBlockListing, cancellationToken)
            .ConfigureAwait(false);

        await revisionReader.ReadAsync(contentOutputStream, onProgress, cancellationToken).ConfigureAwait(false);
    }

    private void ReleaseBlockListing(int numberOfBlockListings)
    {
        var newRemainingNumberOfBlocks = Interlocked.Add(ref _remainingNumberOfBlocksToList, -numberOfBlockListings);

        var amountToRelease = Math.Max(newRemainingNumberOfBlocks >= 0 ? numberOfBlockListings : newRemainingNumberOfBlocks + numberOfBlockListings, 0);

        _client.BlockListingSemaphore.Release(amountToRelease);
    }
}
