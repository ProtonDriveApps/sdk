using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Telemetry;

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
        if (!downloadStateTaskCompletionSource.Task.IsCompletedSuccessfully)
        {
            var state = await RevisionOperations.CreateDownloadStateAsync(
                    _client,
                    _revisionUid,
                    ReleaseBlockListing,
                    cancellationToken).ConfigureAwait(false);

            downloadStateTaskCompletionSource.SetResult(state);
        }

        var downloadState = downloadStateTaskCompletionSource.Task.Result;

        if (downloadState.GetNumberOfBytesWritten() > 0)
        {
            if (!contentOutputStream.CanSeek)
            {
                throw new InvalidOperationException("Cannot resume download to a non-seekable stream");
            }

            contentOutputStream.Seek(downloadState.GetNumberOfBytesWritten(), SeekOrigin.Begin);
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

        var downloadEvent = new DownloadEvent
        {
            DownloadedSize = 0,
            VolumeType = VolumeType.OwnVolume, // FIXME: figure out how to get the actual volume type
        };

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
            OnFailed,
            OnSucceeded);

        void OnFailed(Exception ex)
        {
            downloadEvent.Error = TelemetryErrorResolver.GetDownloadErrorFromException(ex);
            downloadEvent.OriginalError = ex.GetBaseException().ToString();
            RaiseTelemetryEvent(downloadEvent);
        }

        void OnSucceeded(long claimedFileSize, long downloadedByteCount)
        {
            // TODO: deprecate DownloadedSize in favor of ApproximateDownloadedSize
            downloadEvent.DownloadedSize = downloadedByteCount;
            downloadEvent.ApproximateDownloadedSize = Privacy.ReduceSizePrecision(downloadedByteCount);
            downloadEvent.ClaimedFileSize = claimedFileSize;

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
