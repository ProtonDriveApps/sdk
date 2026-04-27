using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Nodes.Download;

public sealed partial class PhotosFileDownloader : IFileDownloader
{
    private readonly ProtonPhotosClient _client;
    private readonly NodeUid _photoUid;
    private readonly long _queueToken;
    private readonly ILogger _logger;

    private PhotosFileDownloader(ProtonPhotosClient client, NodeUid photoUid, long queueToken, ILogger logger)
    {
        _client = client;
        _photoUid = photoUid;
        _queueToken = queueToken;
        _logger = logger;
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
        _client.DriveClient.DownloadQueue.RemoveFileFromQueue(_queueToken);
    }

    internal static PhotosFileDownloader? TryCreate(ProtonPhotosClient client, NodeUid photoUid)
    {
        const int initialEstimatedNumberOfBlocks = 1;

        if (client.DriveClient.DownloadQueue.TryEnqueueFile(initialEstimatedNumberOfBlocks) is not { } queueToken)
        {
            return null;
        }

        return new PhotosFileDownloader(
            client,
            photoUid,
            queueToken,
            client.DriveClient.Telemetry.GetLogger("Photos file downloader"));
    }

    internal static async ValueTask<PhotosFileDownloader> CreateAsync(ProtonPhotosClient client, NodeUid photoUid, CancellationToken cancellationToken)
    {
        const int initialEstimatedNumberOfBlocks = 1;

        var queuePosition = await client.DriveClient.DownloadQueue.EnqueueFileAsync(initialEstimatedNumberOfBlocks, cancellationToken).ConfigureAwait(false);

        return new PhotosFileDownloader(
            client,
            photoUid,
            queuePosition,
            client.DriveClient.Telemetry.GetLogger("Photos file downloader"));
    }

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
                _queueToken,
                cancellationToken).ConfigureAwait(false);

            downloadStateTaskCompletionSource.SetResult(state);
        }

        var downloadState = await downloadStateTaskCompletionSource.Task.ConfigureAwait(false);

        var revisionReader = RevisionOperations.OpenForReading(_client.DriveClient, downloadState);

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
            var downloadEvent = await TelemetryEventFactory.CreateDownloadEventAsync(_client.DriveClient, _photoUid, cancellationToken).ConfigureAwait(false);

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
            var downloadEvent = await TelemetryEventFactory.CreateDownloadEventAsync(_client.DriveClient, _photoUid, cancellationToken).ConfigureAwait(false);

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
            _client.DriveClient.Telemetry.RecordMetric(downloadEvent);
        }
        catch (Exception ex)
        {
            LogTelemetryEventFailed(_logger, ex);
        }
    }
}
