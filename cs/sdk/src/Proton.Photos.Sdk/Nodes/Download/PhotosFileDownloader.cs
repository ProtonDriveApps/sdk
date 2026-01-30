using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk.Telemetry;

namespace Proton.Photos.Sdk.Nodes.Download;

public sealed partial class PhotosFileDownloader : IFileDownloader
{
    private readonly ProtonPhotosClient _client;
    private readonly NodeUid _photoUid;
    private readonly ILogger _logger;

    private volatile int _remainingNumberOfBlocksToList;

    private PhotosFileDownloader(ProtonPhotosClient client, NodeUid photoUid, ILogger logger)
    {
        _client = client;
        _photoUid = photoUid;
        _logger = logger;
        _remainingNumberOfBlocksToList = 1;
    }

    public DownloadController DownloadToStream(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        return DownloadToStream(contentOutputStream, ownsOutputStream: false, onProgress, cancellationToken);
    }

    public DownloadController DownloadToFile(string filePath, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var stream = File.Open(filePath, FileMode.Create, FileAccess.Write, FileShare.None);
        return DownloadToStream(stream, ownsOutputStream: true, onProgress, cancellationToken);
    }

    public void Dispose()
    {
        ReleaseRemainingBlockListing();
    }

    internal static async ValueTask<PhotosFileDownloader> CreateAsync(ProtonPhotosClient client, NodeUid photoUid, CancellationToken cancellationToken)
    {
        var logger = client.DriveClient.Telemetry.GetLogger("Photo downloader");
        LogEnteringBlockListingSemaphore(logger, photoUid, 1);
        await client.DriveClient.BlockListingSemaphore.EnterAsync(1, cancellationToken).ConfigureAwait(false);
        LogEnteredBlockListingSemaphore(logger, photoUid, 1);

        return new PhotosFileDownloader(client, photoUid, logger);
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to enter block listing semaphore for photo {PhotoUid} with {Increment}")]
    private static partial void LogEnteringBlockListingSemaphore(ILogger logger, NodeUid photoUid, int increment);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Entered block listing semaphore for photo {PhotoUid} with {Increment}")]
    private static partial void LogEnteredBlockListingSemaphore(ILogger logger, NodeUid photoUid, int increment);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Decrement} from block listing semaphore for photo {PhotoUid}")]
    private static partial void LogReleasedBlockListingSemaphore(ILogger logger, NodeUid photoUid, int decrement);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to record telemetry event")]
    private static partial void LogTelemetryEventFailed(ILogger logger, Exception exception);

    private async Task DownloadToStreamAsync(
        Stream contentOutputStream,
        Action<long, long> onProgress,
        TaskCompletionSource<DownloadState> downloadStateTaskCompletionSource,
        CancellationToken cancellationToken)
    {
        var result = await _client.GetNodeAsync(_photoUid, cancellationToken).ConfigureAwait(false);

        if (result is null || !result.Value.TryGetValueElseError(out var node, out _) || node is not FileNode fileNode)
        {
            throw new ProtonDriveException($"Revision not found for photo with ID {_photoUid}");
        }

        if (!downloadStateTaskCompletionSource.Task.IsCompletedSuccessfully)
        {
            var state = await RevisionOperations.CreateDownloadStateAsync(
                _client.DriveClient,
                fileNode.ActiveRevision.Uid,
                ReleaseBlockListing,
                cancellationToken).ConfigureAwait(false);

            downloadStateTaskCompletionSource.SetResult(state);
        }

        var downloadState = downloadStateTaskCompletionSource.Task.Result;

        await _client.DriveClient.BlockDownloader.Queue.StartFileAsync(cancellationToken).ConfigureAwait(false);

        using var revisionReader = RevisionOperations.OpenForReading(_client.DriveClient, downloadState, ReleaseBlockListing);

        await revisionReader.ReadAsync(contentOutputStream, onProgress, cancellationToken).ConfigureAwait(false);
    }

    private DownloadController DownloadToStream(
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
            VolumeType = VolumeType.Photo,
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
            _client.DriveClient.Telemetry.RecordMetric(downloadEvent);
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
