using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;

namespace Proton.Photos.Sdk.Nodes;

public sealed partial class PhotosDownloader : IFileDownloader
{
    private readonly ProtonPhotosClient _client;
    private readonly NodeUid _photoUid;
    private readonly ILogger _logger;

    private volatile int _remainingNumberOfBlocksToList;

    private PhotosDownloader(ProtonPhotosClient client, NodeUid photoUid, ILogger logger)
    {
        _client = client;
        _photoUid = photoUid;
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

    internal static async ValueTask<PhotosDownloader> CreateAsync(ProtonPhotosClient client, NodeUid photoUid, CancellationToken cancellationToken)
    {
        var logger = client.DriveClient.Telemetry.GetLogger("Photo downloader");
        LogEnteringBlockListingSemaphore(logger, photoUid, 1);
        await client.DriveClient.BlockListingSemaphore.EnterAsync(1, cancellationToken).ConfigureAwait(false);
        LogEnteredBlockListingSemaphore(logger, photoUid, 1);

        return new PhotosDownloader(client, photoUid, logger);
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to enter block listing semaphore for photo {PhotoUid} with {Increment}")]
    private static partial void LogEnteringBlockListingSemaphore(ILogger logger, NodeUid photoUid, int increment);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Entered block listing semaphore for photo {PhotoUid} with {Increment}")]
    private static partial void LogEnteredBlockListingSemaphore(ILogger logger, NodeUid photoUid, int increment);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Decrement} from block listing semaphore for photo {PhotoUid}")]
    private static partial void LogReleasedBlockListingSemaphore(ILogger logger, NodeUid photoUid, int decrement);

    private async Task DownloadToStreamAsync(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var result = await _client.DriveClient.GetNodeAsync(_photoUid, cancellationToken).ConfigureAwait(false);

        if (result is null || !result.Value.TryGetValueElseError(out var node, out _) || node is not FileNode fileNode)
        {
            throw new ProtonDriveException($"Revision not found for photo with ID {_photoUid}");
        }

        using var revisionReader = await RevisionOperations.OpenForReadingAsync(
                _client.DriveClient,
                fileNode.ActiveRevision.Uid,
                ReleaseBlockListing,
                cancellationToken)
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

        _client.DriveClient.BlockListingSemaphore.Release(amountToRelease);
        LogReleasedBlockListingSemaphore(_logger, _photoUid, amountToRelease);
    }

    private void ReleaseRemainingBlockListing()
    {
        if (_remainingNumberOfBlocksToList <= 0)
        {
            return;
        }

        _client.DriveClient.BlockListingSemaphore.Release(_remainingNumberOfBlocksToList);
        LogReleasedBlockListingSemaphore(_logger, _photoUid, _remainingNumberOfBlocksToList);

        _remainingNumberOfBlocksToList = 0;
    }
}
