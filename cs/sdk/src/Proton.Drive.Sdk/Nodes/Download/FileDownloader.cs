using Microsoft.Extensions.Logging;

namespace Proton.Drive.Sdk.Nodes.Download;

public sealed partial class FileDownloader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly RevisionUid _revisionUid;
    private readonly ILogger _logger;
    private volatile int _remainingNumberOfBlocksToList;

    private FileDownloader(ProtonDriveClient client, RevisionUid revisionUid, ILogger logger)
    {
        _client = client;
        _revisionUid = revisionUid;
        _logger = logger;
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
        var logger = client.Telemetry.GetLogger("File downloader");

        LogAcquiringBlockListingSemaphore(logger, revisionUid, 1);

        await client.BlockListingSemaphore.EnterAsync(1, cancellationToken).ConfigureAwait(false);

        LogAcquiredBlockListingSemaphore(logger, revisionUid, 1);

        return new FileDownloader(client, revisionUid, logger);
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to acquire {Count} from block listing semaphore for revision \"{RevisionUid}\"")]
    private static partial void LogAcquiringBlockListingSemaphore(ILogger logger, RevisionUid revisionUid, int count);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Acquired {Count} from block listing semaphore for revision \"{RevisionUid}\"")]
    private static partial void LogAcquiredBlockListingSemaphore(ILogger logger, RevisionUid revisionUid, int count);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Count} from block listing semaphore for revision \"{RevisionUid}\"")]
    private static partial void LogReleasedBlockListingSemaphore(ILogger logger, RevisionUid revisionUid, int count);

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
        LogReleasedBlockListingSemaphore(_logger, _revisionUid, amountToRelease);
    }

    private void ReleaseRemainingBlockListing()
    {
        if (_remainingNumberOfBlocksToList <= 0)
        {
            return;
        }

        _client.BlockListingSemaphore.Release(_remainingNumberOfBlocksToList);
        LogReleasedBlockListingSemaphore(_logger, _revisionUid, _remainingNumberOfBlocksToList);

        _remainingNumberOfBlocksToList = 0;
    }
}
