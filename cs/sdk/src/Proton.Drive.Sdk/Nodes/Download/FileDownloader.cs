using Microsoft.Extensions.Logging;

namespace Proton.Drive.Sdk.Nodes.Download;

public sealed partial class FileDownloader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly RevisionUid _revisionUid;
    private volatile int _remainingNumberOfBlocksToList;

    private FileDownloader(ProtonDriveClient client, RevisionUid revisionUid)
    {
        _client = client;
        _revisionUid = revisionUid;
        _remainingNumberOfBlocksToList = 1;
    }

    public DownloadController DownloadToStream(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var task = DownloadToStreamAsync(contentOutputStream, onProgress, cancellationToken);

        return new DownloadController(task);
    }

    public DownloadController DownloadToFile(string filePath, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var task = DownloadToFileAsync(filePath, onProgress, cancellationToken);

        return new DownloadController(task);
    }

    public void Dispose()
    {
        ReleaseRemainingBlockListing();
    }

    internal static async ValueTask<FileDownloader> CreateAsync(ProtonDriveClient client, RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        LogEnteringBlockListingSemaphore(client.Logger, revisionUid, 1);
        await client.BlockListingSemaphore.EnterAsync(1, cancellationToken).ConfigureAwait(false);
        LogEnteredBlockListingSemaphore(client.Logger, revisionUid, 1);

        return new FileDownloader(client, revisionUid);
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to enter block listing semaphore for revision {RevisionUid} with {Increment}")]
    private static partial void LogEnteringBlockListingSemaphore(ILogger logger, RevisionUid revisionUid, int increment);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Entered block listing semaphore for revision {RevisionUid} with {Increment}")]
    private static partial void LogEnteredBlockListingSemaphore(ILogger logger, RevisionUid revisionUid, int increment);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Decrement} from block listing semaphore for revision {RevisionUid}")]
    private static partial void LogReleasedBlockListingSemaphore(ILogger logger, RevisionUid revisionUid, int decrement);

    private async Task DownloadToStreamAsync(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        using var revisionReader = await RevisionOperations.OpenForReadingAsync(_client, _revisionUid, ReleaseBlockListing, cancellationToken)
            .ConfigureAwait(false);

        await revisionReader.ReadAsync(contentOutputStream, onProgress, cancellationToken).ConfigureAwait(false);
    }

    private async Task DownloadToFileAsync(string filePath, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var contentOutputStream = File.Open(filePath, FileMode.Create, FileAccess.Write, FileShare.None);

        await using (contentOutputStream.ConfigureAwait(false))
        {
            await DownloadToStreamAsync(contentOutputStream, onProgress, cancellationToken).ConfigureAwait(false);
        }
    }

    private void ReleaseBlockListing(int numberOfBlockListings)
    {
        var newRemainingNumberOfBlocks = Interlocked.Add(ref _remainingNumberOfBlocksToList, -numberOfBlockListings);

        var amountToRelease = Math.Max(
            newRemainingNumberOfBlocks >= 0
                ? numberOfBlockListings
                : newRemainingNumberOfBlocks + numberOfBlockListings,
            0);

        _client.BlockListingSemaphore.Release(amountToRelease);
        LogReleasedBlockListingSemaphore(_client.Logger, _revisionUid, amountToRelease);
    }

    private void ReleaseRemainingBlockListing()
    {
        if (_remainingNumberOfBlocksToList <= 0)
        {
            return;
        }

        _client.BlockListingSemaphore.Release(_remainingNumberOfBlocksToList);
        LogReleasedBlockListingSemaphore(_client.Logger, _revisionUid, _remainingNumberOfBlocksToList);

        _remainingNumberOfBlocksToList = 0;
    }
}
