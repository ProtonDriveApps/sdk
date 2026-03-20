using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk.Threading;

namespace Proton.Drive.Sdk.Nodes.Download;

public sealed partial class FileDownloader : IFileDownloader
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
        return BuildDownloadController(contentOutputStream, ownsOutputStream: false, onProgress, cancellationToken);
    }

    public DownloadController DownloadToFile(string filePath, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var contentOutputStream = File.Open(filePath, FileMode.Create, FileAccess.Write, FileShare.None);

        return BuildDownloadController(contentOutputStream, ownsOutputStream: true, onProgress, cancellationToken);
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

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to record telemetry event")]
    private static partial void LogTelemetryEventFailed(ILogger logger, Exception exception);

    private async Task DownloadToStreamAsync(
        Stream contentOutputStream,
        Action<long, long> onProgress,
        TaskCompletionSource<DownloadState> downloadStateTaskCompletionSource,
        CancellationToken cancellationToken)
    {
        var downloadState = downloadStateTaskCompletionSource.Task.GetResultIfCompletedSuccessfully();
        if (downloadState is null)
        {
            downloadState = await RevisionOperations.CreateDownloadStateAsync(
                    _client,
                    _revisionUid,
                    ReleaseBlockListing,
                    cancellationToken).ConfigureAwait(false);

            downloadStateTaskCompletionSource.SetResult(downloadState);
        }

        await _client.BlockDownloader.Queue.StartFileAsync(cancellationToken).ConfigureAwait(false);

        using var revisionReader = RevisionOperations.OpenForReading(_client, downloadState, ReleaseBlockListing);

        await revisionReader.ReadAsync(contentOutputStream, onProgress, cancellationToken).ConfigureAwait(false);
    }

    private DownloadController BuildDownloadController(
        Stream contentOutputStream,
        bool ownsOutputStream,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var taskControl = new TaskControl(cancellationToken);

        var downloadStateTaskCompletionSource = new TaskCompletionSource<DownloadState>();

        var downloadFunction = (CancellationToken ct) => DownloadToStreamAsync(
            contentOutputStream,
            onProgress,
            downloadStateTaskCompletionSource,
            ct);

        return new DownloadController(
            downloadStateTaskCompletionSource.Task,
            downloadFunction.Invoke(taskControl.PauseOrCancellationToken),
            downloadFunction,
            ownsOutputStream ? contentOutputStream : null,
            taskControl,
            OnFailedAsync,
            OnSucceededAsync);

        async ValueTask OnFailedAsync(Exception ex, long claimedFileSize, long downloadedByteCount)
        {
            var downloadEvent = await TelemetryEventFactory.CreateDownloadEventAsync(_client, _revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

            // TODO: deprecate DownloadedSize in favor of ApproximateDownloadedSize
            downloadEvent.ClaimedFileSize = claimedFileSize;
            downloadEvent.ApproximateClaimedFileSize = Privacy.ReduceSizePrecision(claimedFileSize);
            downloadEvent.DownloadedSize = downloadedByteCount;
            downloadEvent.ApproximateDownloadedSize = Privacy.ReduceSizePrecision(downloadedByteCount);
            downloadEvent.Error = TelemetryErrorResolver.GetDownloadErrorFromException(ex);
            downloadEvent.OriginalError = ex;
            RaiseTelemetryEvent(downloadEvent);
        }

        async ValueTask OnSucceededAsync(long claimedFileSize, long downloadedByteCount)
        {
            var downloadEvent = await TelemetryEventFactory.CreateDownloadEventAsync(_client, _revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

            // TODO: deprecate DownloadedSize in favor of ApproximateDownloadedSize
            downloadEvent.ClaimedFileSize = claimedFileSize;
            downloadEvent.ApproximateClaimedFileSize = Privacy.ReduceSizePrecision(claimedFileSize);
            downloadEvent.DownloadedSize = downloadedByteCount;
            downloadEvent.ApproximateDownloadedSize = Privacy.ReduceSizePrecision(downloadedByteCount);

            RaiseTelemetryEvent(downloadEvent);
        }
    }

    private void RaiseTelemetryEvent(DownloadEvent downloadEvent)
    {
        try
        {
            _client.Telemetry.RecordMetric(downloadEvent);
        }
        catch (Exception ex)
        {
            LogTelemetryEventFailed(_logger, ex);
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
