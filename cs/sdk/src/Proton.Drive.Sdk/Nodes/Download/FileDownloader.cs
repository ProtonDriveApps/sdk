using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk.Threading;

namespace Proton.Drive.Sdk.Nodes.Download;

public sealed partial class FileDownloader : IFileDownloader
{
    private readonly ProtonDriveClient _client;
    private readonly long _queueToken;
    private readonly RevisionUid _revisionUid;
    private readonly ILogger _logger;

    private FileDownloader(ProtonDriveClient client, long queueToken, RevisionUid revisionUid, ILogger logger)
    {
        _client = client;
        _queueToken = queueToken;
        _revisionUid = revisionUid;
        _logger = logger;
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
        _client.DownloadQueue.RemoveFileFromQueue(_queueToken);
    }

    internal static FileDownloader? TryCreate(ProtonDriveClient client, RevisionUid revisionUid)
    {
        const int initialEstimatedNumberOfBlocks = 1;

        if (client.DownloadQueue.TryEnqueueFile(initialEstimatedNumberOfBlocks) is not { } queueToken)
        {
            return null;
        }

        return new FileDownloader(
            client,
            queueToken,
            revisionUid,
            client.Telemetry.GetLogger("File downloader"));
    }

    internal static async ValueTask<FileDownloader> CreateAsync(ProtonDriveClient client, RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        const int initialEstimatedNumberOfBlocks = 1;

        var queueToken = await client.DownloadQueue.EnqueueFileAsync(initialEstimatedNumberOfBlocks, cancellationToken).ConfigureAwait(false);

        return new FileDownloader(
            client,
            queueToken,
            revisionUid,
            client.Telemetry.GetLogger("File downloader"));
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to record telemetry event")]
    private static partial void LogTelemetryEventFailed(ILogger logger, Exception exception);

    private async Task DownloadToStreamAsync(
        Stream contentOutputStream,
        Action<long, long> onProgress,
        TaskCompletionSource<DownloadState> downloadStateTaskCompletionSource,
        long queueToken,
        CancellationToken cancellationToken)
    {
        var downloadState = downloadStateTaskCompletionSource.Task.GetResultIfCompletedSuccessfully();
        if (downloadState is null)
        {
            downloadState = await RevisionOperations.CreateDownloadStateAsync(
                _client,
                _revisionUid,
                queueToken,
                cancellationToken).ConfigureAwait(false);

            downloadStateTaskCompletionSource.SetResult(downloadState);
        }

        var revisionReader = RevisionOperations.OpenForReading(_client, downloadState);

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
            _queueToken,
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
}
